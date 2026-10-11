"use client";

import * as React from "react";
import Link from "next/link";
import { Pencil, PiggyBank, Plus, Ticket, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DeniedAction } from "@/components/auth/denied-action";
import { StatTile } from "@/components/dashboard/stat-tile";
import { formatDay } from "@/components/detailing/booking-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { newIdempotencyKey } from "@/lib/api/client";
import { PAYMENT_METHODS } from "@/lib/api/billing";
import { pesos } from "@/lib/api/crm";
import { useCrmActions, useCrmCustomers, usePrepaidPackages, usePrepaidPlans, useTiers } from "@/lib/crm";
import { useDetailingCatalogue } from "@/lib/detailing";
import { useCan } from "@/lib/rbac";
import type { MembershipTier, PrepaidPlan } from "@/types/crm";

const ANY = "any";

/**
 * Membership tiers, prepaid plans, and the packages sold. A package's price is
 * taken up front and owed as service until its credits are used: "still owed"
 * is the API's figure for what Unearned Revenue holds. A credit is redeemed
 * from the finished job's own page.
 */
export default function MembershipsPage() {
  const tiers = useTiers();
  const plans = usePrepaidPlans();
  const [page, setPage] = React.useState(1);
  const packages = usePrepaidPackages(page);
  const { can, reason } = useCan();
  const manages = can("crm:manage");
  const works = can("crm:work");
  const [tier, setTier] = React.useState<MembershipTier | "new" | null>(null);
  const [plan, setPlan] = React.useState<PrepaidPlan | "new" | null>(null);
  const [selling, setSelling] = React.useState(false);

  const error = tiers.error ?? plans.error ?? packages.error;
  if (error) return <QueryError error={error} onRetry={() => void Promise.all([tiers.refetch(), plans.refetch(), packages.refetch()])} />;
  if (!tiers.data || !plans.data || !packages.data) return <Skeleton className="h-96" />;

  const gate = (allowed: boolean, capability: "crm:manage" | "crm:work", node: React.ReactElement) => (allowed ? node : <DeniedAction reason={reason(capability)}>{node}</DeniedAction>);
  const summary = packages.data.summary;

  return (
    <>
      <PageHeader
        title="Memberships & packages"
        description="Tiers and what they give, prepaid plans, and the packages customers have bought."
        actions={gate(
          works,
          "crm:work",
          <Button variant="primary" onClick={() => setSelling(true)}>
            <Ticket />
            Sell a package
          </Button>
        )}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Packages sold" value={String(summary.sold)} icon={Ticket} hint={pesos(summary.soldCents)} />
        <StatTile label="Still owed as service" value={pesos(summary.unearnedCents)} icon={PiggyBank} hint="What Unearned Revenue holds for prepaid packages" />
        <StatTile label="Members" value={String(tiers.data.reduce((total, row) => total + row.members, 0))} icon={Wallet} hint={`${tiers.data.filter((row) => row.isActive).length} tiers on offer`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Membership tiers</h2>
            {gate(
              manages,
              "crm:manage",
              <Button size="sm" onClick={() => setTier("new")}>
                <Plus />
                Add a tier
              </Button>
            )}
          </div>
          <ul className="divide-y divide-border text-xs">
            {tiers.data.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 py-2.5">
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    {row.name}
                    {!row.isActive ? <Badge tone="outline">Off</Badge> : null}
                  </p>
                  <p className="text-2xs text-subtle-foreground">
                    {Number(row.discountPct)}% off detailing{row.priorityBooking ? " · priority booking" : ""}
                    {row.perks ? ` · ${row.perks}` : ""}
                  </p>
                </div>
                <span className="flex items-center gap-2">
                  <span className="tabular text-muted-foreground">{row.members} members</span>
                  {gate(
                    manages,
                    "crm:manage",
                    <Button size="sm" variant="ghost" aria-label={`Edit ${row.name}`} onClick={() => setTier(row)}>
                      <Pencil />
                    </Button>
                  )}
                </span>
              </li>
            ))}
            {tiers.data.length === 0 ? <li className="py-2 text-muted-foreground">No tiers yet.</li> : null}
          </ul>
          <p className="mt-3 text-2xs text-subtle-foreground">Enrol a customer from their own page. The discount comes off each line of their detailing invoices.</p>
        </section>

        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Prepaid plans</h2>
            {gate(
              manages,
              "crm:manage",
              <Button size="sm" onClick={() => setPlan("new")}>
                <Plus />
                Add a plan
              </Button>
            )}
          </div>
          <ul className="divide-y divide-border text-xs">
            {plans.data.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 py-2.5">
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    {row.name}
                    {!row.isActive ? <Badge tone="outline">Off sale</Badge> : null}
                  </p>
                  <p className="text-2xs text-subtle-foreground">
                    {row.credits} credits{row.validDays ? ` · valid ${row.validDays} days` : " · no expiry"}
                  </p>
                </div>
                <span className="flex items-center gap-2">
                  <span className="tabular">{pesos(row.priceCents)}</span>
                  {gate(
                    manages,
                    "crm:manage",
                    <Button size="sm" variant="ghost" aria-label={`Edit ${row.name}`} onClick={() => setPlan(row)}>
                      <Pencil />
                    </Button>
                  )}
                </span>
              </li>
            ))}
            {plans.data.length === 0 ? <li className="py-2 text-muted-foreground">No plans yet.</li> : null}
          </ul>
        </section>
      </div>

      <section className="card-raised mt-6 overflow-x-auto">
        <h2 className="px-5 pt-4 text-sm font-semibold">Packages sold</h2>
        {packages.data.data.length === 0 ? (
          <p className="px-5 py-4 text-xs text-muted-foreground">None yet.</p>
        ) : (
          <table className="mt-2 w-full text-left text-xs">
            <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Package</th>
                <th scope="col" className="px-3 py-3 font-medium">Customer</th>
                <th scope="col" className="px-3 py-3 font-medium">Sold</th>
                <th scope="col" className="px-3 py-3 font-medium">Credits</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Price</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Still owed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {packages.data.data.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium">{row.planName}</p>
                    <p className="tabular text-2xs text-subtle-foreground">{row.reference}</p>
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/shop/crm/customers/${row.customerAccountId}`} className="text-brand hover:underline">
                      {row.customerName}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    {formatDay(row.soldOn)}
                    {row.expiresOn ? <p className="text-2xs text-subtle-foreground">{row.expired ? "Expired" : "Use by"} {formatDay(row.expiresOn)}</p> : null}
                  </td>
                  <td className="tabular px-3 py-3">
                    {row.creditsLeft} of {row.creditsTotal} left
                  </td>
                  <td className="tabular px-3 py-3 text-right">{pesos(row.priceCents)}</td>
                  <td className="tabular px-5 py-3 text-right">{pesos(row.unearnedCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="border-t border-border px-5 py-3">
          <Pagination page={packages.data.meta.page} pageCount={Math.max(1, Math.ceil(packages.data.meta.total / packages.data.meta.perPage))} pageSize={packages.data.meta.perPage} totalItems={packages.data.meta.total} onPageChange={setPage} onPageSizeChange={() => undefined} />
        </div>
      </section>

      {tier ? <TierDialog tier={tier === "new" ? null : tier} onClose={() => setTier(null)} /> : null}
      {plan ? <PlanDialog plan={plan === "new" ? null : plan} onClose={() => setPlan(null)} /> : null}
      {selling ? <SellDialog plans={plans.data.filter((row) => row.isActive)} onClose={() => setSelling(false)} /> : null}
    </>
  );
}

function useSubmit(onClose: () => void) {
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const submit = async (fn: () => Promise<{ ok: boolean; error?: string; fields?: Record<string, string[]> }>) => {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (result.ok) onClose();
    else setFailure(Object.values(result.fields ?? {})[0]?.[0] ?? result.error ?? "That did not work.");
  };
  return { busy, failure, submit };
}

function Shell({ title, description, failure, busy, disabled, action, onSave, onClose, children }: { title: string; description: string; failure: string | null; busy: boolean; disabled?: boolean; action: string; onSave: () => void; onClose: () => void; children: React.ReactNode }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {children}
          {failure ? (
            <p role="alert" className="text-xs text-critical">
              {failure}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || disabled} onClick={onSave}>
            {busy ? "Saving…" : action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const Tick = ({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) => (
  <label className="flex items-center gap-3 text-xs">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-[hsl(var(--brand))]" />
    {children}
  </label>
);

function TierDialog({ tier, onClose }: { tier: MembershipTier | null; onClose: () => void }) {
  const actions = useCrmActions();
  const { busy, failure, submit } = useSubmit(onClose);
  const [draft, setDraft] = React.useState({ name: tier?.name ?? "", discountPct: tier ? String(Number(tier.discountPct)) : "", priorityBooking: tier?.priorityBooking ?? false, perks: tier?.perks ?? "", isActive: tier?.isActive ?? true });

  return (
    <Shell title={tier ? `Edit ${tier.name}` : "Add a tier"} description="What a member gets on their detailing bills." failure={failure} busy={busy} disabled={draft.name.trim() === ""} action={tier ? "Save changes" : "Add tier"} onSave={() => void submit(() => actions.saveTier(draft, tier?.id))} onClose={onClose}>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="tier-name">Name</Label>
          <Input id="tier-name" value={draft.name} onChange={(event) => setDraft((c) => ({ ...c, name: event.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tier-discount">Discount (%)</Label>
          <Input id="tier-discount" type="number" min={0} max={100} step="0.5" value={draft.discountPct} onChange={(event) => setDraft((c) => ({ ...c, discountPct: event.target.value }))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tier-perks">Other perks, in words</Label>
        <Input id="tier-perks" value={draft.perks} onChange={(event) => setDraft((c) => ({ ...c, perks: event.target.value }))} />
      </div>
      <Tick checked={draft.priorityBooking} onChange={(priorityBooking) => setDraft((c) => ({ ...c, priorityBooking }))}>
        Priority booking
      </Tick>
      <Tick checked={draft.isActive} onChange={(isActive) => setDraft((c) => ({ ...c, isActive }))}>
        On offer
      </Tick>
    </Shell>
  );
}

function PlanDialog({ plan, onClose }: { plan: PrepaidPlan | null; onClose: () => void }) {
  const actions = useCrmActions();
  const catalogue = useDetailingCatalogue();
  const { busy, failure, submit } = useSubmit(onClose);
  const [draft, setDraft] = React.useState({ name: plan?.name ?? "", price: plan ? String(plan.priceCents / 100) : "", credits: plan ? String(plan.credits) : "", detailingPackageId: plan?.detailingPackageId ?? "", validDays: plan?.validDays ? String(plan.validDays) : "", isActive: plan?.isActive ?? true });
  const set = (key: "name" | "price" | "credits" | "validDays") => (event: React.ChangeEvent<HTMLInputElement>) => setDraft((c) => ({ ...c, [key]: event.target.value }));

  return (
    <Shell title={plan ? `Edit ${plan.name}` : "Add a prepaid plan"} description="So many credits for a price. One credit pays for one detailing job. Packages already sold keep what they were sold as." failure={failure} busy={busy} disabled={draft.name.trim() === "" || !(Number(draft.price) > 0) || !(Number(draft.credits) >= 1)} action={plan ? "Save changes" : "Add plan"} onSave={() => void submit(() => actions.savePlan(draft, plan?.id))} onClose={onClose}>
      <div className="space-y-1.5">
        <Label htmlFor="plan-name">Name</Label>
        <Input id="plan-name" value={draft.name} onChange={set("name")} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="plan-price">Price (₱)</Label>
          <Input id="plan-price" type="number" min={0} step="0.01" value={draft.price} onChange={set("price")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-credits">Credits</Label>
          <Input id="plan-credits" type="number" min={1} step="1" value={draft.credits} onChange={set("credits")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-valid">Valid (days)</Label>
          <Input id="plan-valid" type="number" min={1} step="1" value={draft.validDays} onChange={set("validDays")} placeholder="No expiry" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="plan-package">A credit pays for</Label>
        <Select value={draft.detailingPackageId || ANY} onValueChange={(value) => setDraft((c) => ({ ...c, detailingPackageId: value === ANY ? "" : value }))}>
          <SelectTrigger id="plan-package">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any detailing package</SelectItem>
            {(catalogue.data?.packages ?? []).map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Tick checked={draft.isActive} onChange={(isActive) => setDraft((c) => ({ ...c, isActive }))}>
        On sale
      </Tick>
    </Shell>
  );
}

function SellDialog({ plans, onClose }: { plans: PrepaidPlan[]; onClose: () => void }) {
  const actions = useCrmActions();
  const { busy, failure, submit } = useSubmit(onClose);
  // Minted once: a retried click replays the sale instead of selling twice.
  const [key] = React.useState(newIdempotencyKey);
  const [search, setSearch] = React.useState("");
  const customers = useCrmCustomers({ q: search.trim() || undefined });
  const [sale, setSale] = React.useState({ customerAccountId: "", planId: "", paymentMethod: "cash", paymentReference: "" });
  const chosen = plans.find((plan) => plan.id === sale.planId);

  return (
    <Shell title="Sell a prepaid package" description="The price is taken now and owed as service until the credits are used. It is booked when you save." failure={failure} busy={busy} disabled={sale.customerAccountId === "" || sale.planId === ""} action={chosen ? `Take ${pesos(chosen.priceCents)}` : "Sell"} onSave={() => void submit(() => actions.sellPackage(sale, key))} onClose={onClose}>
      <div className="space-y-1.5">
        <Label htmlFor="sell-search">Customer</Label>
        <Input id="sell-search" type="search" placeholder="Search by name" value={search} onChange={(event) => setSearch(event.target.value)} />
        <Select value={sale.customerAccountId} onValueChange={(customerAccountId) => setSale((c) => ({ ...c, customerAccountId }))}>
          <SelectTrigger aria-label="Customer">
            <SelectValue placeholder="Pick a customer" />
          </SelectTrigger>
          <SelectContent>
            {(customers.data?.data ?? []).map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                {customer.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sell-plan">Plan</Label>
        <Select value={sale.planId} onValueChange={(planId) => setSale((c) => ({ ...c, planId }))}>
          <SelectTrigger id="sell-plan">
            <SelectValue placeholder="Pick a plan" />
          </SelectTrigger>
          <SelectContent>
            {plans.map((plan) => (
              <SelectItem key={plan.id} value={plan.id}>
                {plan.name} · {pesos(plan.priceCents)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="sell-method">Paid by</Label>
          <Select value={sale.paymentMethod} onValueChange={(paymentMethod) => setSale((c) => ({ ...c, paymentMethod }))}>
            <SelectTrigger id="sell-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((method) => (
                <SelectItem key={method.value} value={method.value}>
                  {method.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sell-reference">Reference number</Label>
          <Input id="sell-reference" value={sale.paymentReference} onChange={(event) => setSale((c) => ({ ...c, paymentReference: event.target.value }))} placeholder={sale.paymentMethod === "cash" ? "Not needed for cash" : ""} />
        </div>
      </div>
    </Shell>
  );
}
