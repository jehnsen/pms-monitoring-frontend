"use client";

import * as React from "react";
import { Check, Lock, Minus, ShieldCheck, UserCheck, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { AddUserDialog } from "@/components/access/add-user-dialog";
import { DEMO_ACCOUNTS, DEMO_MODE, useAuthActions, useSession } from "@/lib/auth";
import {
  ALL_CAPABILITIES,
  CAPABILITY_LABEL,
  CLIENT_ROLES,
  PROVIDER_ROLES,
  ROLE_CAPABILITIES,
  ROLE_DESCRIPTION,
  ROLE_LABEL,
  useCan,
  type UserRole,
} from "@/lib/rbac";
import { useFleetActions, useFleetClients, useInvitations, useMembers } from "@/lib/store";
import { describeApiError } from "@/lib/api/errors";
import { cn, formatDate } from "@/lib/utils";

/**
 * The two sides of the tenancy boundary, rendered as separate matrices rather
 * than one merged table — the distinction that matters is not which
 * capabilities a role holds but how far they reach, and a single table hides
 * exactly that.
 */
const MATRICES: {
  key: string;
  title: string;
  reach: string;
  roles: UserRole[];
}[] = [
  {
    key: "provider",
    title: "Provider-side roles",
    reach: "Reach every fleet client beneath the provider.",
    roles: PROVIDER_ROLES,
  },
  {
    key: "client",
    title: "Client-side roles",
    reach:
      "Scoped to one fleet client. No client-side role can see another client's data, even under the same provider.",
    roles: CLIENT_ROLES,
  },
];

export default function AccessPage() {
  const { session } = useSession();
  const { switchAccount } = useAuthActions();
  const { can, reason } = useCan();
  const staff = session?.side === "staff";
  const canManageAccess = can("access:manage");
  const { fleetClients } = useFleetClients({ enabled: canManageAccess && staff });
  // The API scopes the roster: staff see the organization's people; a
  // client's people see only their own account's.
  const members = useMembers({ enabled: canManageAccess });
  const invitations = useInvitations({ enabled: canManageAccess });
  const { revokeInvitation } = useFleetActions();
  const pendingInvitations = (invitations.data ?? []).filter((invitation) => invitation.status === "pending");

  // Which account is mid-switch, so the buttons can be held while a real
  // sign-out/sign-in round trip is in flight.
  const [switching, setSwitching] = React.useState<string | null>(null);
  const [switchError, setSwitchError] = React.useState<string | null>(null);

  const personnel = members.data ?? null;
  const personnelError = members.error ? describeApiError(members.error) : null;

  async function onSwitch(email: string) {
    setSwitching(email);
    setSwitchError(null);
    const result = await switchAccount(email);
    if (!result.ok) setSwitchError(result.error);
    setSwitching(null);
  }

  return (
    <>
      <PageHeader
        title="User access control"
        description="Who can see what, and who can change it. Roles are assigned per account and enforced across every screen."
      />

      <div className="mb-5 flex items-start gap-3 rounded-lg border border-border bg-surface-2/60 px-4 py-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-foreground" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Enforced by the server.</span> Every request is checked
          against the signed-in role, the customer account or branches it reaches, and the modules switched on.
          This page shows what that means; it doesn&apos;t decide it.
        </p>
      </div>

      {session ? (
        <section className="card-raised mb-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Avatar name={session.name} />
              <div>
                <p className="text-sm font-medium">{session.name}</p>
                <p className="text-xs text-subtle-foreground">
                  {session.email}
                  {session.fleetClientName ? ` · ${session.fleetClientName}` : ` · ${session.providerName}`}
                </p>
              </div>
            </div>
            <Badge tone="brand" size="md">
              <UserCheck />
              {session.roleLabel}
            </Badge>
          </div>
          <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
            {ROLE_DESCRIPTION[session.role]}
          </p>
        </section>
      ) : null}

      <section className="card-raised mb-5">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Personnel</h3>
            <p className="mt-0.5 text-xs text-subtle-foreground">
              {canManageAccess
                ? staff
                  ? "Everyone authorised on this provider, across every fleet client beneath it."
                  : "Everyone authorised on your fleet. Provider staff and other clients' people are not listed."
                : "Visible to the provider admin only."}
            </p>
          </div>
          {session && canManageAccess ? (
            <AddUserDialog
              session={session}
              fleetClients={fleetClients}
              onCreated={() => void invitations.refetch()}
            />
          ) : null}
        </header>

        {canManageAccess ? (
          <>
            {personnelError ? (
              <p className="border-t border-border px-5 py-3 text-xs text-critical">
                {personnelError}
              </p>
            ) : null}

            <div className="overflow-x-auto border-t border-border">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {["Person", "Email", "Role", "Grants"].map((heading, index) => (
                      <th
                        key={heading || index}
                        className="whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-subtle-foreground"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {personnel === null ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-xs text-subtle-foreground">
                        Loading…
                      </td>
                    </tr>
                  ) : null}
                  {personnel?.map((account) => {
                    const active = session?.uid === account.id;
                    return (
                      <tr
                        key={account.id}
                        className={cn(
                          "transition-colors hover:bg-surface-2/50",
                          active && "bg-brand-muted/40"
                        )}
                      >
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2.5">
                            <Avatar name={account.name} size="sm" />
                            <span>
                              <span className="block text-xs font-medium">
                                {account.name}
                              </span>
                              <span className="block text-2xs text-subtle-foreground">
                                {account.title || "—"}
                                {account.status !== "active" ? " · disabled" : ""}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className="tabular whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                          {account.email}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={active ? "brand" : "neutral"}>
                            {account.roleLabel}
                          </Badge>
                        </td>
                        <td className="tabular px-4 py-3 text-xs text-muted-foreground">
                          {(ROLE_CAPABILITIES[account.role] ?? []).length} of{" "}
                          {ALL_CAPABILITIES.length}
                          {active ? (
                            <span className="ml-2 text-2xs font-medium text-brand">
                              · current session
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 border-t border-border px-5 py-14 text-center">
            <Lock className="size-5 text-subtle-foreground" />
            <p className="text-sm font-medium">Restricted to the provider admin</p>
            <p className="max-w-sm text-xs leading-relaxed text-subtle-foreground">
              {reason("access:manage")}
            </p>
          </div>
        )}
      </section>

      {canManageAccess && pendingInvitations.length > 0 ? (
        <section className="card-raised mb-5">
          <header className="px-5 pb-3 pt-4">
            <h3 className="text-sm font-semibold tracking-tight">Pending invitations</h3>
            <p className="mt-0.5 text-xs text-subtle-foreground">Sent, not yet accepted.</p>
          </header>
          <ul className="divide-y divide-border border-t border-border">
            {pendingInvitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{invitation.name}</span>
                  <span className="block truncate text-2xs text-subtle-foreground">
                    {invitation.email} · {ROLE_LABEL[invitation.role] ?? invitation.role} · expires {formatDate(invitation.expiresAt.slice(0, 10))}
                  </span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => void revokeInvitation(invitation.id)}>
                  <X />
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Demo builds only. Switching account crosses the tenancy boundary the
          rest of the page describes, so it is labelled as the shortcut it is. */}
      {DEMO_MODE ? (
      <section className="card-raised mb-5 border-warning/35">
        <header className="px-5 pb-3 pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <ShieldCheck className="size-4 shrink-0 text-subtle-foreground" />
            Demo account switcher
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-subtle-foreground">
            Signs you out and back in as a seeded demo account, on either side of
            the tenancy boundary — so the isolation above can be seen working.
            Shown only in demo builds.
          </p>
        </header>

        <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4">
          {DEMO_ACCOUNTS.map((account) => {
            const active = session?.email === account.email;
            return (
              <Button
                key={account.email}
                variant={active ? "primary" : "secondary"}
                size="sm"
                // Switching is a real sign-out/sign-in against the API, so every
                // button is held while one is in flight.
                disabled={active || switching !== null}
                onClick={() => void onSwitch(account.email)}
              >
                {switching === account.email ? "Switching…" : ROLE_LABEL[account.role]}
              </Button>
            );
          })}
        </div>

        {switchError ? (
          <p className="border-t border-border px-5 py-3 text-xs text-critical">
            {switchError}
          </p>
        ) : null}
      </section>
      ) : null}

      <section className="card-raised">
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Permission matrix
            </h3>
            <p className="mt-0.5 text-xs text-subtle-foreground">
              {can("access:manage")
                ? "Every capability the application checks, and which roles hold it."
                : "Who holds which capability — visible to the provider admin only."}
            </p>
          </div>
          {can("access:manage") ? (
            <Badge tone="ok" size="md">
              <Check />
              You can manage access
            </Badge>
          ) : (
            <Badge tone="neutral" size="md">
              <Lock />
              Provider admin only
            </Badge>
          )}
        </header>

        {can("access:manage") ? (
          <div className="border-t border-border">
            {MATRICES.map((matrix) => (
              <section key={matrix.key} className="border-b border-border last:border-b-0">
                <header className="px-5 pb-2.5 pt-4">
                  <h4 className="text-xs font-semibold tracking-tight">
                    {matrix.title}
                  </h4>
                  <p className="mt-0.5 text-2xs leading-relaxed text-subtle-foreground">
                    {matrix.reach}
                  </p>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-y border-border">
                        <th className="px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-subtle-foreground">
                          Capability
                        </th>
                        {matrix.roles.map((role) => (
                          <th
                            key={role}
                            className="px-3 py-2.5 text-center text-2xs font-semibold uppercase tracking-wider text-subtle-foreground"
                          >
                            {ROLE_LABEL[role]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {ALL_CAPABILITIES.map((capability) => (
                        <tr key={capability} className="hover:bg-surface-2/50">
                          <td className="px-4 py-2.5">
                            <span className="text-xs font-medium">
                              {CAPABILITY_LABEL[capability]}
                            </span>
                            <span className="tabular mt-0.5 block text-2xs text-subtle-foreground">
                              {capability}
                            </span>
                          </td>
                          {matrix.roles.map((role) => {
                            const granted =
                              ROLE_CAPABILITIES[role].includes(capability);
                            return (
                              <td key={role} className="px-3 py-2.5 text-center">
                                {/* Icon plus a text label for screen readers —
                                    never a bare colour or glyph carrying the
                                    meaning alone. */}
                                {granted ? (
                                  <>
                                    <Check
                                      className="mx-auto size-4 text-ok"
                                      aria-hidden
                                    />
                                    <span className="sr-only">Granted</span>
                                  </>
                                ) : (
                                  <>
                                    <Minus
                                      className="mx-auto size-4 text-border-strong"
                                      aria-hidden
                                    />
                                    <span className="sr-only">Not granted</span>
                                  </>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 border-t border-border px-5 py-14 text-center">
            <Lock className="size-5 text-subtle-foreground" />
            <p className="text-sm font-medium">Restricted to the provider admin role</p>
            <p className="max-w-sm text-xs leading-relaxed text-subtle-foreground">
              {reason("access:manage")}
            </p>
          </div>
        )}
      </section>
    </>
  );
}
