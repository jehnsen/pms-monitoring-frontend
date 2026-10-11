"use client";

import * as React from "react";
import { Crown, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { newIdempotencyKey } from "@/lib/api/client";
import { useSession } from "@/lib/auth";
import { useCrmActions, useCustomerBenefits } from "@/lib/crm";
import { useCan } from "@/lib/rbac";

/** Whether this session has the CRM at all: the module on where it works, and leave to read it. */
function useHasCrm() {
  const { session } = useSession();
  const { can } = useCan();
  return Boolean(session?.modules.includes("crm")) && can("crm:view");
}

/**
 * What a customer holds, for the counter: their tier and what it gives, the
 * prepaid credits they can use, their points. The API's figures; nothing is
 * shown where the session has no CRM.
 */
export function CustomerBenefitsNote({ accountId }: { accountId: string }) {
  const has = useHasCrm();
  const { data } = useCustomerBenefits(has && accountId ? accountId : undefined);
  if (!data || (!data.membership && data.packages.length === 0 && data.points === 0)) return null;

  return (
    <div className="rounded-md border border-border bg-surface-2/60 p-3 text-xs" role="note">
      {data.membership ? (
        <p className="flex items-center gap-1.5 font-medium">
          <Crown className="size-3.5 text-brand" aria-hidden />
          {data.membership.tierName}: {Number(data.membership.discountPct)}% off{data.membership.priorityBooking ? ", priority booking" : ""}
          {data.membership.perks ? `, ${data.membership.perks.toLowerCase()}` : ""}
        </p>
      ) : null}
      {data.packages.map((pack) => (
        <p key={pack.id} className="mt-1 flex items-center gap-1.5">
          <Ticket className="size-3.5 text-subtle-foreground" aria-hidden />
          {pack.planName}: {pack.creditsLeft} of {pack.creditsTotal} credits left <span className="text-subtle-foreground">({pack.reference})</span>
        </p>
      ))}
      {data.points !== 0 ? <p className="mt-1 text-subtle-foreground">{data.points.toLocaleString("en-PH")} loyalty points</p> : null}
    </div>
  );
}

/**
 * Settle a finished, signed-off job with one of the customer's prepaid
 * credits instead of an invoice. Offered only where the API says the job may
 * be redeemed against (`next.canRedeem`) and the customer holds a credit that
 * covers this package; the API books it and refuses what does not add up.
 */
export function RedeemCredit({ bookingId, accountId, packageId, canRedeem }: { bookingId: string; accountId: string; packageId: string; canRedeem: boolean }) {
  const has = useHasCrm();
  const { can } = useCan();
  const actions = useCrmActions();
  const { data } = useCustomerBenefits(has && canRedeem ? accountId : undefined);
  // Minted once: a retried click replays the redemption instead of using a second credit.
  const [key] = React.useState(newIdempotencyKey);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  const usable = (data?.packages ?? []).filter((pack) => pack.detailingPackageId === null || pack.detailingPackageId === packageId);
  if (!canRedeem || usable.length === 0 || !can("crm:work")) return null;

  return (
    <div className="space-y-2 border-t border-border pt-3">
      {usable.map((pack) => (
        <Button
          key={pack.id}
          className="w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const result = await actions.redeemCredit(pack.id, bookingId, key);
            setBusy(false);
            setFailure(result.ok ? null : result.error);
          }}
        >
          <Ticket />
          Use a credit of {pack.planName} ({pack.creditsLeft} left)
        </Button>
      ))}
      <p className="text-2xs text-subtle-foreground">Settles the job with no invoice. It cannot be undone.</p>
      {failure ? (
        <p role="alert" className="text-xs text-critical">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
