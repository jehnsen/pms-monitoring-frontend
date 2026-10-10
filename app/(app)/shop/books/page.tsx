"use client";

import * as React from "react";
import { BookOpen, Pencil, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeniedAction } from "@/components/auth/denied-action";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/ui/query-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { accountTypeLabel, Amount, BooksGate } from "@/components/books/books-chrome";
import { ACCOUNT_TYPES } from "@/lib/api/ledger";
import { useLedgerAccounts, useLedgerActions } from "@/lib/ledger";
import { useCan } from "@/lib/rbac";
import { manilaDateDaysAgo } from "@/lib/utils";
import type { AccountType, LedgerAccount } from "@/types/ledger";

/**
 * Chart of accounts. The lean chart is installed the first time the books are
 * used; the organization renames, adds to and deactivates it. Balances are the
 * API's, through the date chosen, over the branches in view. Once an account
 * has been posted to, its code, type and side are fixed.
 */
export default function ChartOfAccountsPage() {
  return (
    <BooksGate>
      <Chart />
    </BooksGate>
  );
}

function Chart() {
  const { can, reason } = useCan();
  const [asOf, setAsOf] = React.useState(() => manilaDateDaysAgo(0));
  const [type, setType] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [showInactive, setShowInactive] = React.useState(false);
  const { data, error, refetch } = useLedgerAccounts(asOf);
  const [editing, setEditing] = React.useState<LedgerAccount | "new" | null>(null);

  const rows = (data?.accounts ?? []).filter(
    (a) =>
      (showInactive || a.isActive) &&
      (type === "all" || a.type === type) &&
      (q.trim() === "" || `${a.code} ${a.name}`.toLowerCase().includes(q.trim().toLowerCase()))
  );

  const add = (
    <Button variant="primary" size="sm" onClick={() => setEditing("new")}>
      <Plus />
      Add account
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Chart of accounts"
        description="The accounts every invoice, payment and stock movement is booked to. Balances run through the date chosen."
        actions={can("ledger:manage") ? add : <DeniedAction reason={reason("ledger:manage")}>{add}</DeniedAction>}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="chart-as-of" className="text-2xs">
            Balances as of
          </Label>
          <Input id="chart-as-of" type="date" className="h-9 w-40" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger aria-label="Account type" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Every type</SelectItem>
            {ACCOUNT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input aria-label="Search accounts" placeholder="Code or name" className="w-56 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      {error ? (
        <QueryError error={error} onRetry={() => void refetch()} />
      ) : !data ? (
        <Skeleton className="h-72" />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={BookOpen} title="No accounts match" description="Change the filters above." />
        </div>
      ) : (
        <section className="card-raised overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Code</th>
                <th className="px-3 py-3 font-medium">Account</th>
                <th className="px-3 py-3 font-medium">Type</th>
                <th className="px-3 py-3 font-medium">Normal side</th>
                <th className="px-3 py-3 text-right font-medium">Balance</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((account) => (
                <tr key={account.id} className={account.isActive ? "" : "text-subtle-foreground"}>
                  <td className="tabular px-5 py-3 font-medium">{account.code}</td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{account.name}</p>
                    {account.description ? <p className="text-2xs text-subtle-foreground">{account.description}</p> : null}
                  </td>
                  <td className="px-3 py-3">{accountTypeLabel(account.type)}</td>
                  <td className="px-3 py-3 capitalize">{account.normalSide}</td>
                  <td className="px-3 py-3 text-right">
                    <Amount value={account.balance} className={account.balance < 0 ? "text-critical" : ""} />
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex flex-wrap gap-1">
                      <Badge tone={account.isActive ? "ok" : "outline"}>{account.isActive ? "Active" : "Inactive"}</Badge>
                      {account.ruleKeys.length > 0 ? <Badge tone="brand">Used by {account.ruleKeys.length} {account.ruleKeys.length === 1 ? "rule" : "rules"}</Badge> : null}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {can("ledger:manage") ? (
                      <Button variant="ghost" size="sm" aria-label={`Edit ${account.name}`} onClick={() => setEditing(account)}>
                        <Pencil />
                        Edit
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <AccountDialog account={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function AccountDialog({ account, onClose }: { account: LedgerAccount | "new" | null; onClose: () => void }) {
  const { createAccount, updateAccount } = useLedgerActions();
  const existing = account !== null && account !== "new" ? account : null;
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<AccountType>("revenue");
  const [description, setDescription] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string[]>>({});
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (account === null) return;
    setCode(existing?.code ?? "");
    setName(existing?.name ?? "");
    setType(existing?.type ?? "revenue");
    setDescription(existing?.description ?? "");
    setActive(existing?.isActive ?? true);
    setError(null);
    setFields({});
  }, [account, existing]);

  const fixed = existing !== null && (existing.hasPostings || existing.isSystem);

  async function submit() {
    setPending(true);
    setError(null);
    const result = existing
      ? await updateAccount(existing.id, {
          ...(fixed ? {} : { code: code.trim() }),
          name: name.trim(),
          description: description.trim(),
          isActive: active,
        })
      : await createAccount({ code: code.trim(), name: name.trim(), type, description: description.trim() || undefined });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setFields(result.fields ?? {});
      return;
    }
    onClose();
  }

  return (
    <Dialog open={account !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existing.name}` : "Add an account"}</DialogTitle>
          <DialogDescription>
            {existing
              ? fixed
                ? "This account is part of the books, so its code and type are fixed. You can rename or describe it."
                : "Nothing has been posted to it yet, so every field can change."
              : "A new account takes postings only once a posting rule points at it."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="account-code">Code</Label>
              <Input id="account-code" value={code} disabled={fixed} onChange={(e) => setCode(e.target.value)} />
              {fields.code?.[0] ? <p className="text-2xs text-critical">{fields.code[0]}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-name">Name</Label>
              <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} />
              {fields.name?.[0] ? <p className="text-2xs text-critical">{fields.name[0]}</p> : null}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="account-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as AccountType)} disabled={existing !== null}>
              <SelectTrigger id="account-type" aria-label="Type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="account-description">Description</Label>
            <Textarea id="account-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {existing ? (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active (an inactive account takes no new postings)
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-critical">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={pending || name.trim().length < 2 || (!existing && code.trim() === "")} onClick={() => void submit()}>
            {pending ? "Saving…" : existing ? "Save" : "Add account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
