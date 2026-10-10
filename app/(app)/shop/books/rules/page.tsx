"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { DeniedAction } from "@/components/auth/denied-action";
import { Input } from "@/components/ui/input";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BooksGate } from "@/components/books/books-chrome";
import { useLedgerAccounts, useLedgerActions, useLedgerSettings, usePostingRules } from "@/lib/ledger";
import { useCan } from "@/lib/rbac";
import { manilaDateDaysAgo } from "@/lib/utils";
import type { AccountingTarget, LedgerAccount, PostingRule } from "@/types/ledger";

/**
 * Posting rules: which account each kind of event or category is booked to,
 * and the accountant's side of the books (which product the journal is
 * exported for, and what each account is called there). A change applies to
 * postings from then on; entries already made are never rewritten.
 */
export default function PostingRulesPage() {
  return (
    <BooksGate>
      <Rules />
    </BooksGate>
  );
}

function Rules() {
  const { can, reason } = useCan();
  const rules = usePostingRules();
  const chart = useLedgerAccounts(manilaDateDaysAgo(0));
  const manage = can("ledger:manage");

  return (
    <>
      <PageHeader title="Posting rules" description="Where each event or category is booked. Organization admins can point a rule at another account of the same kind." />

      {rules.error ? (
        <QueryError error={rules.error} onRetry={() => void rules.refetch()} />
      ) : !rules.data || !chart.data ? (
        <Skeleton className="h-96" />
      ) : (
        <RulesTable rules={rules.data} accounts={chart.data.accounts} manage={manage} manageReason={reason("ledger:manage")} />
      )}

      <ExportSettings accounts={chart.data?.accounts ?? []} manage={manage} manageReason={reason("ledger:manage")} />
    </>
  );
}

function RulesTable({ rules, accounts, manage, manageReason }: { rules: PostingRule[]; accounts: LedgerAccount[]; manage: boolean; manageReason: string }) {
  const { updateRules } = useLedgerActions();
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const groups = React.useMemo(() => {
    const out = new Map<string, PostingRule[]>();
    for (const rule of rules) out.set(rule.group, [...(out.get(rule.group) ?? []), rule]);
    return [...out.entries()];
  }, [rules]);

  const changes = Object.entries(draft)
    .filter(([key, accountId]) => rules.find((r) => r.key === key)?.accountId !== accountId)
    .map(([key, accountId]) => ({ key, accountId }));

  async function save() {
    setPending(true);
    setError(null);
    setSaved(false);
    const result = await updateRules(changes);
    setPending(false);
    if (!result.ok) {
      const first = Object.values(result.fields ?? {})[0]?.[0];
      setError(first ?? result.error);
      return;
    }
    setDraft({});
    setSaved(true);
  }

  const button = (
    <Button variant="primary" size="sm" disabled={changes.length === 0 || pending} onClick={() => void save()}>
      {pending ? "Saving…" : changes.length === 0 ? "Save changes" : `Save ${changes.length} ${changes.length === 1 ? "change" : "changes"}`}
    </Button>
  );

  return (
    <section className="card-raised">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Where things are booked</h2>
          <p className="mt-0.5 text-xs text-subtle-foreground">Only accounts of the kind a rule needs are offered.</p>
        </div>
        {manage ? button : <DeniedAction reason={manageReason}>{button}</DeniedAction>}
      </header>
      {error ? (
        <p role="alert" className="px-5 pb-2 text-xs text-critical">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="px-5 pb-2 text-xs text-ok">
          Saved. New postings follow these rules; entries already made are unchanged.
        </p>
      ) : null}
      <div className="overflow-x-auto border-t border-border">
        <table className="w-full text-left text-xs">
          <tbody className="divide-y divide-border">
            {groups.map(([group, items]) => (
              <React.Fragment key={group}>
                <tr className="bg-surface-2">
                  <th colSpan={3} className="px-5 py-2 text-2xs font-medium uppercase tracking-wide text-subtle-foreground">
                    {group}
                  </th>
                </tr>
                {items.map((rule) => {
                  const value = draft[rule.key] ?? rule.accountId ?? "";
                  const options = accounts.filter((a) => a.type === rule.accountType && (a.isActive || a.id === rule.accountId));
                  return (
                    <tr key={rule.key}>
                      <td className="px-5 py-2.5">
                        <p className="font-medium">{rule.label}</p>
                        <p className="tabular text-2xs text-subtle-foreground">{rule.key}</p>
                      </td>
                      <td className="px-3 py-2.5 text-2xs capitalize text-subtle-foreground">{rule.accountType}</td>
                      <td className="w-80 px-5 py-2.5">
                        <Select value={value} disabled={!manage} onValueChange={(accountId) => setDraft((d) => ({ ...d, [rule.key]: accountId }))}>
                          <SelectTrigger aria-label={rule.label}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {options.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.code} · {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const TARGETS: { value: AccountingTarget; label: string }[] = [
  { value: "none", label: "None (plain CSV only)" },
  { value: "xero", label: "Xero" },
  { value: "quickbooks", label: "QuickBooks Online" },
];

function ExportSettings({ accounts, manage, manageReason }: { accounts: LedgerAccount[]; manage: boolean; manageReason: string }) {
  const settings = useLedgerSettings();
  const { setAccountingTarget, saveMappings } = useLedgerActions();
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  if (settings.error) return <QueryError error={settings.error} onRetry={() => void settings.refetch()} />;
  if (!settings.data) return <Skeleton className="mt-6 h-40" />;

  const target = settings.data.accountingTarget;
  const product = target === "none" ? null : target;
  const label = product === "xero" ? "Xero account code" : "QuickBooks account name";
  const current = (accountId: string) => {
    const mapping = settings.data?.mappings.find((m) => m.accountId === accountId && m.target === product);
    return (product === "xero" ? mapping?.externalCode : mapping?.externalName) ?? "";
  };

  async function chooseTarget(next: AccountingTarget) {
    setError(null);
    setSaved(false);
    const result = await setAccountingTarget(next);
    if (!result.ok) setError(result.error);
  }

  async function saveAll() {
    if (!product) return;
    setError(null);
    setSaved(false);
    const changed = accounts.filter((a) => values[a.id] !== undefined && values[a.id] !== current(a.id));
    const result = await saveMappings(
      changed.map((a) => ({ accountId: a.id, target: product, ...(product === "xero" ? { externalCode: values[a.id] } : { externalName: values[a.id] }) }))
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setValues({});
    setSaved(true);
  }

  const dirty = accounts.some((a) => values[a.id] !== undefined && values[a.id] !== current(a.id));
  const saveButton = (
    <Button variant="primary" size="sm" disabled={!dirty} onClick={() => void saveAll()}>
      Save mappings
    </Button>
  );

  return (
    <section className="card-raised mt-6">
      <header className="px-5 pb-3 pt-4">
        <h2 className="text-sm font-semibold tracking-tight">Export to your accountant</h2>
        <p className="mt-0.5 text-xs text-subtle-foreground">
          The journal always exports as a plain CSV. If the books are kept in Xero or QuickBooks Online, choose it here and name each account the way that product does, and the journal also exports in its
          manual-journal import format. There is no live sync.
        </p>
      </header>
      <div className="space-y-4 border-t border-border px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium">Accounting product</span>
          <Select value={target} disabled={!manage} onValueChange={(v) => void chooseTarget(v as AccountingTarget)}>
            <SelectTrigger aria-label="Accounting product" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TARGETS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!manage ? <span className="text-2xs text-subtle-foreground">{manageReason}</span> : null}
        </div>

        {product ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">An export is refused until every account it uses is named below.</p>
              {manage ? saveButton : <DeniedAction reason={manageReason}>{saveButton}</DeniedAction>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-2xs uppercase tracking-wide text-subtle-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Our account</th>
                    <th className="px-3 py-2 font-medium">{label}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {accounts.map((a) => (
                    <tr key={a.id}>
                      <td className="py-2 pr-3">
                        <span className="tabular font-medium">{a.code}</span> · {a.name}
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          aria-label={`${label} for ${a.name}`}
                          className="h-8 w-72"
                          disabled={!manage}
                          value={values[a.id] ?? current(a.id)}
                          onChange={(e) => setValues((v) => ({ ...v, [a.id]: e.target.value }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-critical">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p role="status" className="text-xs text-ok">
            Mappings saved.
          </p>
        ) : null}
      </div>
    </section>
  );
}
