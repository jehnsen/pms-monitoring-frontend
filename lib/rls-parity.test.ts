import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * RLS parity checks.
 *
 * `lib/tenancy.ts` and `supabase/migrations/0001_pms_schema.sql` encode the
 * same rule twice — once in TypeScript for the UI, once in SQL for the
 * database — and CLAUDE.md's requirement is that the server-side copy mirrors
 * the client-side one "verbatim". Two copies of a security rule drift, so
 * these tests pin the properties that must not.
 *
 * This is a static check on the migration text, not a live database test:
 * running the policies for real needs a Postgres connection this project has
 * no credentials for. It catches the failure that actually matters — a table
 * or a rule silently missing its protection — rather than proving Postgres
 * behaves as documented.
 */

const schema = readFileSync(
  resolve(__dirname, "../supabase/migrations/0001_pms_schema.sql"),
  "utf8"
);

const serviceTasksSchema = readFileSync(
  resolve(__dirname, "../supabase/migrations/0004_pms_service_tasks.sql"),
  "utf8"
);

const normalisationSchema = readFileSync(
  resolve(__dirname, "../supabase/migrations/0006_pms_normalisation.sql"),
  "utf8"
);

/**
 * Every migration that creates a `pms_` table, concatenated.
 *
 * The "created but unprotected" check below has to see *all* of them: a table
 * created in a later migration and checked only against 0001 would pass
 * vacuously — the check would simply never see the table it was meant to
 * catch. Adding a migration that creates a table means adding it here.
 */
const workflowSchema = readFileSync(
  resolve(__dirname, "../supabase/migrations/0007_pms_workflow.sql"),
  "utf8"
);

const allSchemas = [
  schema,
  serviceTasksSchema,
  normalisationSchema,
  // Creates no tables — it only alters existing ones — but is included so the
  // check stays honest if a later edit adds one here.
  workflowSchema,
].join("\n");

/** Every table the fleet's data actually lives in. */
const TENANT_TABLES = [
  "pms_providers",
  "pms_fleet_clients",
  "pms_profiles",
  "pms_vehicles",
  "pms_work_orders",
  "pms_work_order_events",
  "pms_work_order_lines",
  "pms_approval_log",
  "pms_documents",
  "pms_parts",
  "pms_purchase_orders",
  "pms_purchase_order_lines",
  "pms_approval_settings",
  "pms_alert_interactions",
];

/** The normalised relations added in 0006 — catalogues and junction tables. */
const NORMALISED_TABLES = [
  "pms_technicians",
  "pms_vendors",
  "pms_work_order_tasks",
  "pms_work_order_parts",
  "pms_purchase_order_line_tasks",
  "pms_purchase_order_line_vehicles",
];

describe("row level security is enabled everywhere", () => {
  it.each(TENANT_TABLES)("protects %s", (table) => {
    expect(schema).toMatch(
      new RegExp(`alter table\\s+${table}\\s+enable row level security`)
    );
  });

  it.each(NORMALISED_TABLES)("protects %s", (table) => {
    expect(normalisationSchema).toMatch(
      new RegExp(`alter table\\s+${table}\\s+enable row level security`)
    );
  });

  it("enables RLS on every table any migration creates", () => {
    const created = [...allSchemas.matchAll(/create table if not exists (pms_\w+)/g)].map(
      (m) => m[1]
    );
    const enabled = [
      ...allSchemas.matchAll(/alter table\s+(pms_\w+)\s+enable row level security/g),
    ].map((m) => m[1]);

    expect(created.length).toBeGreaterThan(0);
    // A created-but-unprotected table is readable by every authenticated user
    // of the shared project, including the unrelated app's users.
    expect(created.filter((t) => !enabled.includes(t))).toEqual([]);
  });

  it("grants select to authenticated on every table it creates", () => {
    // RLS with no grant is a table nobody can read; a grant with no RLS is one
    // everybody can. Both halves are required, so both are checked.
    const created = [...allSchemas.matchAll(/create table if not exists (pms_\w+)/g)].map(
      (m) => m[1]
    );
    const ungranted = created.filter(
      (table) => !new RegExp(`grant[^;]*\\bon ${table}\\b[^;]*to authenticated`).test(allSchemas)
    );
    expect(ungranted).toEqual([]);
  });

  it("grants nothing to anon", () => {
    // Fleet data must never be reachable without a session. `anon` appearing in
    // a grant would expose rows to any holder of the public key.
    expect(allSchemas).not.toMatch(/grant[^;]*\bto\s+anon\b/);
  });
});

describe("normalised child tables inherit their parent's tenancy", () => {
  // These carry no fleet_client_id of their own: a junction row is visible
  // exactly when its parent is. Resolving through the parent is what stops a
  // sibling-client leak — the same reason work orders resolve through their
  // vehicle rather than storing a provider id.
  it.each(["pms_work_order_tasks", "pms_work_order_parts"])(
    "%s resolves through its work order",
    (table) => {
      const policy = normalisationSchema.slice(
        normalisationSchema.indexOf(`create policy ${table.replace("pms_", "pms_")}_read on ${table}`)
      );
      expect(policy).toContain("pms_can_access_client(pms_client_for_work_order(work_order_id))");
    }
  );

  it.each(["pms_purchase_order_line_tasks", "pms_purchase_order_line_vehicles"])(
    "%s resolves through its purchase order line",
    (table) => {
      expect(normalisationSchema).toMatch(
        new RegExp(
          `on ${table}[\\s\\S]{0,200}?pms_can_access_client\\(pms_client_for_po_line\\(purchase_order_line_id\\)\\)`
        )
      );
    }
  );

  it("resolves a PO line's client with a pinned search_path", () => {
    const fn = normalisationSchema.slice(
      normalisationSchema.indexOf("create or replace function pms_client_for_po_line")
    );
    expect(fn).toContain("security definer");
    expect(fn).toContain("set search_path = public, pg_temp");
  });
});

describe("provider catalogues stay provider-writable only", () => {
  // A fleet client must not be able to edit the shop's own staff list, the
  // same rule pms_service_tasks already enforces.
  it.each(["pms_technicians", "pms_vendors"])("%s is provider-side write only", (table) => {
    for (const action of ["insert", "update", "delete"]) {
      expect(normalisationSchema).toMatch(
        new RegExp(`on ${table}\\s+for ${action}[\\s\\S]{0,200}?pms_is_provider_side\\(\\)`)
      );
    }
  });
});

describe("append-only tables cannot be rewritten", () => {
  // The work-order history and the approval log are the shop's record of what
  // happened and what was authorised. Both are append-only by design; a grant
  // of update or delete would make that a convention rather than a guarantee.
  it.each(["pms_work_order_events", "pms_approval_log"])(
    "grants no update or delete on %s",
    (table) => {
      const grants = [...schema.matchAll(new RegExp(`grant ([^;]+) on ${table}`, "g"))].map(
        (m) => m[1]
      );
      expect(grants.length).toBeGreaterThan(0);
      for (const grant of grants) {
        expect(grant).not.toMatch(/\bupdate\b/);
        expect(grant).not.toMatch(/\bdelete\b/);
      }
    }
  );

  it.each(["pms_work_order_events", "pms_approval_log"])(
    "declares no update or delete policy on %s",
    (table) => {
      expect(schema).not.toMatch(
        new RegExp(`create policy \\w+ on ${table}\\s+for (update|delete)`)
      );
    }
  );
});

describe("scope resolution mirrors explainTenantScope", () => {
  const fn = schema.slice(
    schema.indexOf("create or replace function pms_visible_client_ids"),
    schema.indexOf("create or replace function pms_can_access_client")
  );

  it("requires a provider (denial: no_provider / unknown_provider)", () => {
    expect(fn).toContain("me.provider_id is not null");
    expect(fn).toContain("c.provider_id = me.provider_id");
  });

  it("excludes suspended clients (denial: client_suspended)", () => {
    expect(fn).toContain("c.status = 'active'");
  });

  it("refuses provider-wide reach to client-side roles (denial: role_side_mismatch)", () => {
    // A client-side role with no client pinned must NOT inherit provider-wide
    // visibility — precisely the escalation the tenancy module exists to stop.
    expect(fn).toMatch(
      /me\.fleet_client_id is null[\s\S]*?me\.role in \(\s*'provider_admin',\s*'service_advisor',\s*'provider_technician'\s*\)/
    );
  });

  it("pins a client-side session to exactly one client, never a sibling", () => {
    expect(fn).toContain("else c.id = me.fleet_client_id");
  });

  it("is SECURITY DEFINER with a pinned search_path", () => {
    // Without the pinned path, a caller could shadow pms_profiles and lift
    // their own scope.
    expect(fn).toContain("security definer");
    expect(fn).toContain("set search_path = public, pg_temp");
  });
});

describe("work order tenancy derives through the vehicle", () => {
  it("scopes work orders by their vehicle's client, not a stored column", () => {
    // Mirrors scopeFleetState: an order whose vehicle is out of scope is
    // dropped rather than surviving as an orphan.
    const policy = schema.slice(
      schema.indexOf("create policy pms_work_orders_read"),
      schema.indexOf("create policy pms_work_orders_insert")
    );
    expect(policy).toContain("from pms_vehicles v");
    expect(policy).toContain("pms_can_access_client(v.fleet_client_id)");
  });

  it("re-checks on update so an order cannot be moved across tenants", () => {
    const policy = schema.slice(
      schema.indexOf("create policy pms_work_orders_update"),
      schema.indexOf("-- ---------------------------------------- work order events")
    );
    // Both USING (which rows may be updated) and WITH CHECK (what they may
    // become) must be present, or an order could be re-pointed at another
    // tenant's vehicle.
    expect(policy).toContain("using (");
    expect(policy).toContain("with check (");
  });
});

describe("the approval log cannot be stamped with a foreign tenant", () => {
  it("requires the stamped client to match the order's own client", () => {
    const policy = schema.slice(
      schema.indexOf("create policy pms_approval_log_insert"),
      schema.indexOf("-- -------------------------------------------------------- documents")
    );
    expect(policy).toContain("fleet_client_id = pms_client_for_work_order(work_order_id)");
  });
});

describe("role and tenancy are not self-serviceable", () => {
  it("pins role, provider, and client on a self-update", () => {
    const policy = schema.slice(
      schema.indexOf("create policy pms_profiles_update_self"),
      schema.indexOf("-- --------------------------------------------------------- vehicles")
    );
    // A user rewriting their own fleet_client_id would be a one-statement
    // tenant escape.
    expect(policy).toContain("role = (select role from pms_profiles where id = auth.uid())");
    expect(policy).toContain("provider_id is not distinct from");
    expect(policy).toContain("fleet_client_id is not distinct from");
  });
});

describe("provider-only writes stay provider-only", () => {
  it("requires provider-side for branding updates", () => {
    const policy = schema.slice(
      schema.indexOf("create policy pms_providers_update"),
      schema.indexOf("-- ------------------------------------------------------ fleet clients")
    );
    expect(policy).toContain("pms_is_provider_side()");
  });

  it("requires provider-side for the shared approval defaults", () => {
    // A client editing its own bands writes to approval_threshold_overrides;
    // writing the shared row from a client session was the original bug.
    const policy = schema.slice(
      schema.indexOf("create policy pms_approval_settings_update"),
      schema.indexOf("-- ----------------------------------------------- alert interactions")
    );
    expect(policy).toContain("pms_is_provider_side()");
  });

  it("pins a new client to the session's own provider", () => {
    const policy = schema.slice(
      schema.indexOf("create policy pms_fleet_clients_insert"),
      schema.indexOf("create policy pms_fleet_clients_update")
    );
    expect(policy).toContain("pms_is_provider_side()");
    expect(policy).toContain("provider_id = pms_current_provider_id()");
  });
});

describe("alert interactions are private to one user", () => {
  it("keys every policy on auth.uid()", () => {
    const section = schema.slice(
      schema.indexOf("create policy pms_alerts_read"),
      schema.indexOf("-- =====================================================================\n-- Grants")
    );
    const policies = [...section.matchAll(/create policy (\w+)/g)].map((m) => m[1]);
    expect(policies.length).toBe(3);
    // One person's dismissal must not silence an alert for a colleague.
    expect([...section.matchAll(/user_id = auth\.uid\(\)/g)].length).toBeGreaterThanOrEqual(
      policies.length
    );
  });
});

describe("the service-task catalogue is provider-global, not tenant-writable", () => {
  it("enables RLS", () => {
    expect(serviceTasksSchema).toMatch(
      /alter table pms_service_tasks enable row level security/
    );
  });

  it("lets every session beneath the provider read it, including client-side roles", () => {
    // A fleet manager needs to see what their vehicles are measured against,
    // even though only the provider can change it — same split as branding.
    const policy = serviceTasksSchema.slice(
      serviceTasksSchema.indexOf("create policy pms_service_tasks_read"),
      serviceTasksSchema.indexOf("create policy pms_service_tasks_insert")
    );
    expect(policy).toContain("provider_id = pms_current_provider_id()");
    expect(policy).not.toContain("pms_is_provider_side()");
  });

  it.each(["insert", "update", "delete"] as const)(
    "requires provider-side for %s",
    (op) => {
      const start = serviceTasksSchema.indexOf(`create policy pms_service_tasks_${op}`);
      const nextMarker =
        op === "delete"
          ? "grant select, insert, update, delete"
          : `create policy pms_service_tasks_${
              op === "insert" ? "update" : "delete"
            }`;
      const policy = serviceTasksSchema.slice(
        start,
        serviceTasksSchema.indexOf(nextMarker, start)
      );
      expect(policy).toContain("pms_is_provider_side()");
    }
  );

  it("pins a new task to the session's own provider", () => {
    const policy = serviceTasksSchema.slice(
      serviceTasksSchema.indexOf("create policy pms_service_tasks_insert"),
      serviceTasksSchema.indexOf("create policy pms_service_tasks_update")
    );
    expect(policy).toContain("provider_id = pms_current_provider_id()");
  });

  it("grants nothing to anon", () => {
    expect(serviceTasksSchema).not.toMatch(/grant[^;]*\bto\s+anon\b/);
  });
});
