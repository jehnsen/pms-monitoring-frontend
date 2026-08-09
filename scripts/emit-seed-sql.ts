/**
 * Emits the demo fleet as SQL.
 *
 * The seed is a deterministic *generator* (lib/seed.ts, ~1900 lines), not a
 * table of rows, so hand-translating it to SQL would both be error-prone and
 * drift the moment the generator changed. Instead this runs the real
 * `createSeedState()` and serialises exactly what it returns — the database
 * therefore starts with byte-identical data to what the app produced from
 * localStorage.
 *
 * Run via: npx vitest run scripts/emit-seed-sql.ts
 * Writes:  supabase/migrations/0003_pms_seed.sql
 *
 * This is a build-time authoring tool, not part of the app.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "vitest";
import { createSeedState } from "@/lib/seed";
import { DEFAULT_APPROVAL_SETTINGS } from "@/lib/approvals";
import { SERVICE_TASKS } from "@/lib/service-tasks";

/* ------------------------------------------------------------ SQL literals */

function lit(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "null";
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** A Postgres text[] literal. */
function textArray(values: string[] | undefined): string {
  if (!values || values.length === 0) return "'{}'";
  const inner = values
    .map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",");
  return `'{${inner.replace(/'/g, "''")}}'`;
}

/** A jsonb literal. */
function json(value: unknown): string {
  if (value === null || value === undefined) return "null";
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

/**
 * One multi-row INSERT ... ON CONFLICT DO NOTHING. Chunked because Postgres
 * parameter limits and readability both suffer past a few hundred rows.
 */
function insert(
  table: string,
  columns: string[],
  rows: string[][],
  conflictTarget = "id"
): string {
  if (rows.length === 0) return `-- ${table}: no rows\n`;

  const chunks: string[] = [];
  const size = 200;
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size);
    chunks.push(
      `insert into ${table} (${columns.join(", ")}) values\n` +
        slice.map((r) => `  (${r.join(", ")})`).join(",\n") +
        `\non conflict (${conflictTarget}) do nothing;\n`
    );
  }
  return chunks.join("\n");
}

test("emit seed sql", () => {
  const state = createSeedState();
  const out: string[] = [];

  out.push(`-- =====================================================================
-- MekanikoMoR — demo fleet seed data
--
-- GENERATED FILE — do not edit by hand.
-- Produced by scripts/emit-seed-sql.ts from lib/seed.ts's createSeedState(),
-- so it is exactly the fleet the app used to build in the browser:
-- one provider, four fleet clients, ${state.vehicles.length} vehicles,
-- ${state.workOrders.length} work orders, ${state.documents.length} documents,
-- ${state.parts.length} parts, ${state.purchaseOrders.length} purchase orders.
--
-- To regenerate:  npx vitest run scripts/emit-seed-sql.ts
--
-- Every statement is ON CONFLICT DO NOTHING, so re-running will not duplicate
-- rows. Note that seeded dates were computed relative to the date this file
-- was generated (${new Date().toISOString().slice(0, 10)}); regenerate if the
-- demo should look "current" again.
--
-- Run AFTER 0001_pms_schema.sql. Order matters: providers -> clients ->
-- vehicles -> work orders -> children.
-- =====================================================================
`);

  /* ------------------------------------------------------------ providers */
  out.push("-- ------------------------------------------------- providers");
  out.push(
    insert(
      "pms_providers",
      ["id", "name", "slug", "logo_url", "brand_color", "support_email", "created_at"],
      state.providers.map((p) => [
        lit(p.id), lit(p.name), lit(p.slug), lit(p.logoUrl),
        lit(p.brandColor), lit(p.supportEmail), lit(p.createdAt),
      ])
    )
  );

  /* ------------------------------------------- technician & vendor catalogues
   *
   * Derived from the work orders the generator produced rather than declared
   * separately: the seed is the authority on which names exist, and deriving
   * them keeps the FK targets and the referencing rows from ever disagreeing.
   * Mirrors the backfill in 0006 — same slug rule, same derived ids.
   */
  const slug = (input: string) =>
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const providerId = state.providers[0]?.id ?? "";
  const clientById = new Map(state.fleetClients.map((c) => [c.id, c]));
  const vehicleById = new Map(state.vehicles.map((v) => [v.id, v]));

  /** The provider owning a work order, resolved through its vehicle's client. */
  const providerForOrder = (vehicleId: string) => {
    const vehicle = vehicleById.get(vehicleId);
    const client = vehicle ? clientById.get(vehicle.fleetClientId) : undefined;
    return client?.providerId ?? providerId;
  };

  const technicianIds = new Map<string, string>();
  const vendorIds = new Map<string, string>();
  for (const order of state.workOrders) {
    const owner = providerForOrder(order.vehicleId);
    if (order.technician && slug(order.technician)) {
      technicianIds.set(order.technician, `tech-${owner}-${slug(order.technician)}`);
    }
    if (order.vendor && slug(order.vendor)) {
      vendorIds.set(order.vendor, `vendor-${owner}-${slug(order.vendor)}`);
    }
  }

  out.push("-- ------------------------------------------------- technicians");
  out.push(
    insert(
      "pms_technicians",
      ["id", "provider_id", "name"],
      [...technicianIds].map(([name, id]) => [lit(id), lit(providerId), lit(name)])
    )
  );

  out.push("-- ----------------------------------------------------- vendors");
  out.push(
    insert(
      "pms_vendors",
      ["id", "provider_id", "name"],
      [...vendorIds].map(([name, id]) => [lit(id), lit(providerId), lit(name)])
    )
  );

  /* --------------------------------------------------------- fleet clients */
  out.push("-- ------------------------------------------------- fleet clients");
  out.push(
    insert(
      "pms_fleet_clients",
      [
        "id", "provider_id", "name", "slug", "contact_name", "contact_email",
        "contract_terms", "payment_terms_days", "approval_threshold_overrides",
        "logo_url", "brand_color", "status", "created_at",
      ],
      state.fleetClients.map((c) => [
        lit(c.id), lit(c.providerId), lit(c.name), lit(c.slug),
        lit(c.contactName), lit(c.contactEmail), lit(c.contractTerms),
        lit(c.paymentTermsDays),
        // NULL (inherit everything) is deliberately distinct from '{}'.
        c.approvalThresholdOverrides ? json(c.approvalThresholdOverrides) : "null",
        lit(c.logoUrl), lit(c.brandColor), lit(c.status), lit(c.createdAt),
      ])
    )
  );

  /* ------------------------------------------------------ approval settings */
  out.push("-- --------------------------------------------- approval settings");
  const s = state.approvalSettings ?? DEFAULT_APPROVAL_SETTINGS;
  out.push(
    insert(
      "pms_approval_settings",
      [
        "provider_id", "auto_approve_under", "ops_approval_under", "sla_hours",
        "variance_threshold_pct", "default_parts_source", "monthly_budget",
      ],
      state.providers.map((p) => [
        lit(p.id), lit(s.autoApproveUnder), lit(s.opsApprovalUnder),
        lit(s.slaHours), lit(s.varianceThresholdPct),
        lit(s.defaultPartsSource), lit(s.monthlyBudget),
      ]),
      "provider_id"
    )
  );

  /* ------------------------------------------------------------- vehicles */
  out.push("-- -------------------------------------------------- vehicles");
  out.push(
    insert(
      "pms_vehicles",
      [
        "id", "fleet_client_id", "plate_number", "make", "model", "year", "vin",
        "vehicle_class", "fuel_type", "color", "driver_licence_expiry",
        "odometer", "odometer_read_at", "avg_daily_km", "status", "assigned_to",
        "department", "location", "acquired_on", "registration_expiry",
        "insurance_expiry", "task_state",
      ],
      state.vehicles.map((v) => [
        lit(v.id), lit(v.fleetClientId), lit(v.plateNumber), lit(v.make),
        lit(v.model), lit(v.year), lit(v.vin), lit(v.vehicleClass),
        lit(v.fuelType), lit(v.color), lit(v.driverLicenceExpiry),
        lit(v.odometer), lit(v.odometerReadAt), lit(v.avgDailyKm),
        lit(v.status), lit(v.assignedTo), lit(v.department), lit(v.location),
        lit(v.acquiredOn), lit(v.registrationExpiry), lit(v.insuranceExpiry),
        json(v.taskState),
      ])
    )
  );

  /* ---------------------------------------------------------- work orders */
  out.push("-- ------------------------------------------------ work orders");
  out.push(
    insert(
      "pms_work_orders",
      [
        "id", "reference", "vehicle_id", "title", "type", "status", "priority",
        "opened_on", "scheduled_for", "scheduled_time", "completed_on",
        "odometer_at_service", "technician", "technician_id", "vendor",
        "vendor_id", "bay_id", "collected_at",
        "collected_by", "labor_cost", "parts_cost", "findings",
        "notes", "pending_approval_entered_at", "approval_wait_hours",
      ],
      // `parts` and `task_ids` are gone: rows in pms_work_order_parts and
      // pms_work_order_tasks now, emitted below. The name columns stay
      // alongside their new FKs as the historical label.
      state.workOrders.map((o) => [
        lit(o.id), lit(o.reference), lit(o.vehicleId), lit(o.title), lit(o.type),
        lit(o.status), lit(o.priority), lit(o.openedOn),
        lit(o.scheduledFor || null), lit(o.scheduledTime), lit(o.completedOn),
        lit(o.odometerAtService),
        lit(o.technician), lit(technicianIds.get(o.technician) ?? null),
        lit(o.vendor), lit(vendorIds.get(o.vendor) ?? null),
        lit(o.bayId),
        lit(o.collectedAt), lit(o.collectedBy), lit(o.laborCost),
        lit(o.partsCost), lit(o.findings ?? ""),
        lit(o.notes ?? ""),
        lit(o.pendingApprovalEnteredAt), lit(o.approvalWaitHours),
      ])
    )
  );

  /* -------------------------------------------------- work order events */
  out.push("-- ---------------------------------------- work order history");
  const events = state.workOrders.flatMap((o) =>
    (o.history ?? []).map((e) => [
      lit(e.id), lit(o.id), lit(e.status), lit(e.at), lit(e.actor),
    ])
  );
  out.push(
    insert(
      "pms_work_order_events",
      ["id", "work_order_id", "status", "at", "actor"],
      events
    )
  );

  /* --------------------------------------------------- work order lines */
  out.push("-- ------------------------------------------ work order lines");
  // Catalogue name -> id, so a line billing for a known task carries the FK.
  // A line with no match is genuinely ad-hoc (a job title, a supplementary
  // inspection) and correctly emits a null FK with its text intact.
  const taskIdByName = new Map(
    SERVICE_TASKS.map((t) => [t.name.toLowerCase(), t.id])
  );

  const lines = state.workOrders.flatMap((o) =>
    (o.lines ?? []).map((l) => [
      lit(l.id), lit(o.id),
      lit(taskIdByName.get(l.description.toLowerCase()) ?? null),
      lit(l.description), lit(l.category),
      lit(l.partCost), lit(l.labourCost), lit(l.urgency), lit(l.partsSource),
      lit(l.approvalStatus), lit(l.approvedBy), lit(l.approvedAt),
      lit(l.declineReason), textArray(l.photoUrls),
    ])
  );
  out.push(
    insert(
      "pms_work_order_lines",
      [
        "id", "work_order_id", "service_task_id", "description", "category",
        "part_cost",
        "labour_cost", "urgency", "parts_source", "approval_status",
        "approved_by", "approved_at", "decline_reason", "photo_urls",
      ],
      lines
    )
  );

  /* ------------------------------------------- work order tasks & parts
   *
   * The `task_ids` array and the `parts` jsonb blob, as rows.
   */
  out.push("-- -------------------------------------------- work order tasks");
  const orderTasks = state.workOrders.flatMap((o) =>
    [...new Set(o.taskIds ?? [])].map((taskId) => [lit(o.id), lit(taskId)])
  );
  out.push(
    insert(
      "pms_work_order_tasks",
      ["work_order_id", "service_task_id"],
      orderTasks,
      "work_order_id, service_task_id"
    )
  );

  /* --------------------------------------------------------- approval log */
  out.push("-- -------------------------------------------- approval log");
  const log = state.workOrders.flatMap((o) =>
    (o.approvalLog ?? []).map((e) => [
      lit(e.id), lit(o.id), lit(e.fleetClientId), lit(e.lineId), lit(e.action),
      lit(e.actorId), lit(e.actorName), lit(e.at), lit(e.note),
      lit(e.amountAtTime),
    ])
  );
  out.push(
    insert(
      "pms_approval_log",
      [
        "id", "work_order_id", "fleet_client_id", "line_id", "action",
        "actor_id", "actor_name", "at", "note", "amount_at_time",
      ],
      log
    )
  );

  /* ------------------------------------------------------------ documents */
  out.push("-- ------------------------------------------------- documents");
  out.push(
    insert(
      "pms_documents",
      [
        "id", "fleet_client_id", "name", "kind", "vehicle_id", "work_order_id",
        "uploaded_by", "uploaded_on", "size_bytes", "mime_type", "data_url",
        "expires_on", "reference_number", "issued_on", "issuing_body", "notes",
      ],
      state.documents.map((d) => [
        lit(d.id), lit(d.fleetClientId), lit(d.name), lit(d.kind),
        lit(d.vehicleId), lit(d.workOrderId), lit(d.uploadedBy),
        lit(d.uploadedOn), lit(d.sizeBytes), lit(d.mimeType), lit(d.dataUrl),
        lit(d.expiresOn), lit(d.referenceNumber), lit(d.issuedOn),
        lit(d.issuingBody), lit(d.notes ?? ""),
      ])
    )
  );

  /* ---------------------------------------------------------------- parts */
  out.push("-- ----------------------------------------------------- parts");
  out.push(
    insert(
      "pms_parts",
      [
        "id", "fleet_client_id", "sku", "name", "category", "unit", "unit_cost",
        "current_stock", "reorder_point", "preferred_vendor", "lead_time_days",
      ],
      state.parts.map((p) => [
        lit(p.id), lit(p.fleetClientId), lit(p.sku), lit(p.name),
        lit(p.category), lit(p.unit), lit(p.unitCost), lit(p.currentStock),
        lit(p.reorderPoint), lit(p.preferredVendor), lit(p.leadTimeDays),
      ])
    )
  );

  /* -------------------------------------------------- work order parts
   *
   * Emitted after pms_parts, not with the other work-order children: the
   * part_id FK needs its catalogue row to exist first.
   */
  out.push("-- -------------------------------------------- work order parts");
  // SKU -> part id, resolved within the owning fleet client: SKUs are
  // per-client, so a bare match across clients would attach one tenant's part
  // row to another tenant's job.
  const partIdBySku = new Map(
    state.parts.map((p) => [`${p.fleetClientId}::${p.sku}`, p.id])
  );

  const orderParts = state.workOrders.flatMap((o) => {
    const vehicle = vehicleById.get(o.vehicleId);
    const clientId = vehicle?.fleetClientId ?? "";
    return (o.parts ?? []).map((part, index) => [
      lit(part.id || `${o.id}-part-${index + 1}`),
      lit(o.id),
      lit(partIdBySku.get(`${clientId}::${part.partNumber}`) ?? null),
      lit(part.partNumber),
      lit(part.name),
      lit(part.quantity),
      lit(part.unitCost),
    ]);
  });
  out.push(
    insert(
      "pms_work_order_parts",
      [
        "id", "work_order_id", "part_id", "part_number", "name", "quantity",
        "unit_cost",
      ],
      orderParts
    )
  );

  /* ------------------------------------------------------ purchase orders */
  out.push("-- ------------------------------------------- purchase orders");
  out.push(
    insert(
      "pms_purchase_orders",
      [
        "id", "fleet_client_id", "reference", "vendor", "status", "created_on",
        "created_by", "notes",
      ],
      state.purchaseOrders.map((po) => [
        lit(po.id), lit(po.fleetClientId), lit(po.reference), lit(po.vendor),
        lit(po.status), lit(po.createdOn), lit(po.createdBy), lit(po.notes ?? ""),
      ])
    )
  );

  const poLines = state.purchaseOrders.flatMap((po) =>
    (po.lines ?? []).map((l) => [
      lit(l.id), lit(po.id), lit(l.partId), lit(l.partId || null),
      lit(taskIdByName.get(l.description.toLowerCase()) ?? null),
      lit(l.description), lit(l.quantity), lit(l.unitCost),
    ])
  );
  out.push(
    insert(
      "pms_purchase_order_lines",
      [
        "id", "purchase_order_id", "part_id", "part_ref", "service_task_id",
        "description", "quantity", "unit_cost",
      ],
      poLines
    )
  );

  /* ------------------------------------ purchase order line coverage
   *
   * `service_task_ids` / `vehicle_ids` as junction rows — the arrays could
   * not be joined or constrained.
   */
  const poLineTasks = state.purchaseOrders.flatMap((po) =>
    (po.lines ?? []).flatMap((l) =>
      [...new Set(l.serviceTaskIds ?? [])].map((taskId) => [lit(l.id), lit(taskId)])
    )
  );
  out.push(
    insert(
      "pms_purchase_order_line_tasks",
      ["purchase_order_line_id", "service_task_id"],
      poLineTasks,
      "purchase_order_line_id, service_task_id"
    )
  );

  const poLineVehicles = state.purchaseOrders.flatMap((po) =>
    (po.lines ?? []).flatMap((l) =>
      [...new Set(l.vehicleIds ?? [])].map((vehicleId) => [lit(l.id), lit(vehicleId)])
    )
  );
  out.push(
    insert(
      "pms_purchase_order_line_vehicles",
      ["purchase_order_line_id", "vehicle_id"],
      poLineVehicles,
      "purchase_order_line_id, vehicle_id"
    )
  );

  const dir = resolve(__dirname, "../supabase/migrations");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "0003_pms_seed.sql"), out.join("\n"), "utf8");

  // Surfaced so the generated volume is visible at author time rather than
  // discovered when the migration is run.
  console.log(
    `seed: ${state.vehicles.length} vehicles, ${state.workOrders.length} orders, ` +
      `${events.length} events, ${lines.length} lines, ${log.length} log entries, ` +
      `${state.documents.length} docs, ${state.parts.length} parts, ` +
      `${state.purchaseOrders.length} POs (${poLines.length} lines)`
  );
});
