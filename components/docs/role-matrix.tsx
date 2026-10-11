"use client";

import { Check, Minus } from "lucide-react";
import { ALL_CAPABILITIES, CAPABILITY_LABEL, CLIENT_ROLES, PROVIDER_ROLES, ROLE_CAPABILITIES, ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/rbac";
import type { Capability, UserRole } from "@/types";

/**
 * Who can do what, for the documentation page. It is drawn from the same
 * role table the access page shows (`lib/rbac.ts`, which mirrors the API's
 * AccessMatrix), so the two cannot drift apart. It documents; it allows
 * nothing: what a session may do comes from the API.
 */

const GROUPS: { label: string; prefixes: string[] }[] = [
  { label: "Vehicles, jobs and documents", prefixes: ["vehicle:", "workorder:", "po:", "document:"] },
  { label: "Customers and administration", prefixes: ["customer:", "settings:", "access:", "organization:"] },
  { label: "Stock room", prefixes: ["inventory:"] },
  { label: "Billing", prefixes: ["billing:"] },
  { label: "The books", prefixes: ["ledger:"] },
  { label: "Detailing", prefixes: ["detailing:"] },
  { label: "Equipment", prefixes: ["equipment:"] },
  { label: "CRM", prefixes: ["crm:"] },
];

export function RoleCards({ side }: { side: "staff" | "portal" }) {
  const roles = side === "staff" ? PROVIDER_ROLES : CLIENT_ROLES;
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {roles.map((role) => (
        <div key={role} className="card p-4">
          <dt className="text-sm font-semibold">{ROLE_LABEL[role]}</dt>
          <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{ROLE_DESCRIPTION[role]}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RoleMatrix({ side }: { side: "staff" | "portal" }) {
  const roles: UserRole[] = side === "staff" ? PROVIDER_ROLES : CLIENT_ROLES;
  const holds = (role: UserRole, capability: Capability) => ROLE_CAPABILITIES[role].includes(capability);
  // Only what someone on this side can hold: a fleet client's table has no stock room or books rows.
  const relevant = ALL_CAPABILITIES.filter((capability) => roles.some((role) => holds(role, capability)));

  return (
    <div className="card-raised overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-xs">
        <caption className="sr-only">{side === "staff" ? "What each service-centre role may do" : "What each fleet-client role may do"}</caption>
        <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              May
            </th>
            {roles.map((role) => (
              <th key={role} scope="col" className="px-2 py-3 text-center font-medium">
                {ROLE_LABEL[role]}
              </th>
            ))}
          </tr>
        </thead>
        {GROUPS.map((group) => {
          const rows = relevant.filter((capability) => group.prefixes.some((prefix) => capability.startsWith(prefix)));
          if (rows.length === 0) return null;
          return (
            <tbody key={group.label} className="divide-y divide-border border-b border-border last:border-b-0">
              <tr className="bg-surface-2/60">
                <th scope="colgroup" colSpan={roles.length + 1} className="px-4 py-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </th>
              </tr>
              {rows.map((capability) => (
                <tr key={capability}>
                  <th scope="row" className="px-4 py-2.5 font-normal">
                    {CAPABILITY_LABEL[capability]}
                  </th>
                  {roles.map((role) => (
                    <td key={role} className="px-2 py-2.5 text-center">
                      {holds(role, capability) ? (
                        <>
                          <Check className="mx-auto size-4 text-ok" aria-hidden />
                          <span className="sr-only">Yes</span>
                        </>
                      ) : (
                        <>
                          <Minus className="mx-auto size-3.5 text-subtle-foreground/50" aria-hidden />
                          <span className="sr-only">No</span>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
