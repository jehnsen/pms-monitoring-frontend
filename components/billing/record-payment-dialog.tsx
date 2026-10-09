"use client";

import * as React from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DeniedAction } from "@/components/auth/denied-action";
import { newIdempotencyKey } from "@/lib/api/client";
import { PAYMENT_METHODS } from "@/lib/api/billing";
import { useBillingActions } from "@/lib/receivables";
import { useCan } from "@/lib/rbac";
import { formatPesos } from "@/lib/utils";
import type { Invoice, Payment, PaymentMethod } from "@/types/billing";

/**
 * Records money received from an account. From an invoice, it is applied to
 * that invoice (the amount defaults to its balance); from an account, the API
 * applies it oldest due first. Whatever it does not cover stays as the
 * customer's credit. The request carries one Idempotency-Key per opening of
 * the dialog, so a retry after a dropped connection never records it twice.
 */
export function RecordPaymentDialog({
  accountId,
  accountName,
  invoice,
  onRecorded,
  trigger,
}: {
  accountId: string;
  accountName: string;
  invoice?: Invoice;
  onRecorded?: (payment: Payment) => void;
  trigger?: React.ReactNode;
}) {
  const { recordPayment } = useBillingActions();
  const { canAsStaff, staffReason } = useCan();
  const [open, setOpen] = React.useState(false);
  const [method, setMethod] = React.useState<PaymentMethod>("cash");
  const [reference, setReference] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [receivedOn, setReceivedOn] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string[]>>({});
  const [pending, setPending] = React.useState(false);
  const key = React.useRef(newIdempotencyKey());

  React.useEffect(() => {
    if (!open) return;
    key.current = newIdempotencyKey();
    setMethod("cash");
    setReference("");
    setAmount(invoice ? String(invoice.balance) : "");
    setReceivedOn("");
    setNotes("");
    setError(null);
    setFields({});
  }, [open, invoice]);

  const value = Number(amount);
  const canSubmit = Number.isFinite(value) && value > 0 && (method === "cash" || reference.trim() !== "") && !pending;

  async function submit() {
    setPending(true);
    setError(null);
    const result = await recordPayment(
      {
        customerAccountId: accountId,
        method,
        amount: value,
        referenceNo: reference.trim() || undefined,
        receivedOn: receivedOn || undefined,
        notes: notes.trim() || undefined,
        // From an invoice: as much of it as the payment covers goes there.
        ...(invoice ? { allocations: [{ invoiceId: invoice.id, amount: Math.min(value, invoice.balance) }] } : {}),
      },
      key.current
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      setFields(result.fields ?? {});
      return;
    }
    setOpen(false);
    onRecorded?.(result.data);
  }

  const button = trigger ?? (
    <Button variant="primary" size="sm">
      <Wallet />
      Record payment
    </Button>
  );

  if (!canAsStaff("billing:manage")) return <DeniedAction reason={staffReason("billing:manage")}>{button}</DeniedAction>;

  const fieldError = (name: string) =>
    fields[name]?.[0] ?? Object.entries(fields).find(([key]) => key.startsWith(`${name}.`))?.[1]?.[0] ?? null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{button}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {invoice
              ? `From ${accountName}, against ${invoice.number} (${formatPesos(invoice.balance)} outstanding). Anything over it is held as credit.`
              : `From ${accountName}. It is applied to the oldest invoice due first; anything left is held as credit.`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="payment-method">Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger id="payment-method" aria-label="Method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-amount">Amount (₱)</Label>
              <Input id="payment-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              {fieldError("amount_cents") ? <p className="text-2xs text-critical">{fieldError("amount_cents")}</p> : null}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-reference">Reference no.{method === "cash" ? " (optional)" : ""}</Label>
            <Input id="payment-reference" value={reference} placeholder={method === "check" ? "Bank and check number" : "Transaction reference"} onChange={(e) => setReference(e.target.value)} />
            {fieldError("reference_no") ? <p className="text-2xs text-critical">{fieldError("reference_no")}</p> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="payment-date">Received on</Label>
              <Input id="payment-date" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
              <p className="text-2xs text-subtle-foreground">Blank: today.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-notes">Notes</Label>
              <Input id="payment-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-xs text-critical">
              {fieldError("allocations") ?? error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
            {pending ? "Recording…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
