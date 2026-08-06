"use client";

import { Check, Minus, ShieldCheck, UserCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { DeniedAction } from "@/components/auth/denied-action";
import { DEMO_ACCOUNTS, useAuthActions, useSession } from "@/lib/auth";
import {
  ALL_CAPABILITIES,
  CAPABILITY_LABEL,
  ROLE_CAPABILITIES,
  ROLE_DESCRIPTION,
  ROLE_LABEL,
  useCan,
  type UserRole,
} from "@/lib/rbac";
import { cn, formatDate } from "@/lib/utils";

const ROLE_ORDER: UserRole[] = [
  "fleet_manager",
  "operations",
  "purchasing_officer",
  "technician",
  "viewer",
];

export default function AccessPage() {
  const { session } = useSession();
  const { switchAccount } = useAuthActions();
  const { can, reason } = useCan();

  return (
    <>
      <PageHeader
        title="User access control"
        description="Who can see what, and who can change it. Roles are assigned per account and enforced across every screen."
      />

      {/* The honesty note belongs on the page itself, not just in the code. */}
      <div className="mb-5 flex items-start gap-3 rounded-lg border border-warning/35 bg-warning/[0.08] px-4 py-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-foreground" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">
            Demonstration build.
          </span>{" "}
          Permissions are applied in the browser, so they shape the interface but
          cannot secure it — anyone with developer tools can bypass them. A
          production deployment must mirror this matrix on the server and treat
          the client copy as a hint.
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
                  {session.email} · signed in{" "}
                  {formatDate(session.signedInAt.slice(0, 10))}
                </p>
              </div>
            </div>
            <Badge tone="brand" size="md">
              <UserCheck />
              {ROLE_LABEL[session.role]}
            </Badge>
          </div>
          <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
            {ROLE_DESCRIPTION[session.role]}
          </p>
        </section>
      ) : null}

      <section className="card-raised mb-5">
        <header className="px-5 pb-3 pt-4">
          <h3 className="text-sm font-semibold tracking-tight">Personnel</h3>
          <p className="mt-0.5 text-xs text-subtle-foreground">
            Accounts authorised on this fleet. Switching signs you in as that
            person so you can see the interface they get.
          </p>
        </header>

        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Person", "Email", "Role", "Grants", ""].map((heading, index) => (
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
              {DEMO_ACCOUNTS.map((account) => {
                const active = session?.email === account.email;
                return (
                  <tr
                    key={account.email}
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
                            {account.title}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {account.email}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={active ? "brand" : "neutral"}>
                        {ROLE_LABEL[account.role]}
                      </Badge>
                    </td>
                    <td className="tabular px-4 py-3 text-xs text-muted-foreground">
                      {ROLE_CAPABILITIES[account.role].length} of{" "}
                      {ALL_CAPABILITIES.length}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {active ? (
                        <span className="text-2xs font-medium text-brand">
                          Current session
                        </span>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => switchAccount(account.email)}
                        >
                          Sign in as
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-raised">
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Permission matrix
            </h3>
            <p className="mt-0.5 text-xs text-subtle-foreground">
              Every capability the application checks, and which roles hold it.
            </p>
          </div>
          {can("access:manage") ? (
            <Badge tone="ok" size="md">
              <Check />
              You can manage access
            </Badge>
          ) : (
            <DeniedAction reason={reason("access:manage")}>
              <Badge tone="neutral" size="md">
                Read-only view
              </Badge>
            </DeniedAction>
          )}
        </header>

        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-subtle-foreground">
                  Capability
                </th>
                {ROLE_ORDER.map((role) => (
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
                  {ROLE_ORDER.map((role) => {
                    const granted = ROLE_CAPABILITIES[role].includes(capability);
                    return (
                      <td key={role} className="px-3 py-2.5 text-center">
                        {/* Icon plus a text label for screen readers — never a
                            bare colour or glyph carrying the meaning alone. */}
                        {granted ? (
                          <>
                            <Check className="mx-auto size-4 text-ok" aria-hidden />
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
    </>
  );
}
