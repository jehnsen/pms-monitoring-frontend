"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Download, Send, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ReasonDialog } from "@/components/inventory/reason-dialog";
import { InvoiceStatusBadge, MoneyRow } from "@/components/billing/billing-chrome";
import { RecordPaymentDialog } from "@/components/billing/record-payment-dialog";
import { newIdempotencyKey } from "@/lib/api/client";
import { useBillingActions, useInvoice } from "@/lib/receivables";
import { useCan } from "@/lib/rbac";
import { formatDate, formatPesos, formatQuantity } from "@/lib/utils";
import type { Invoice, InvoiceLine } from "@/types/billing";

const TAX_LABEL: Record<InvoiceLine["taxClass"], string> = { vatable: "VATable", vat_exempt: "VAT-exempt", zero_rated: "Zero-rated" };

/** Issuing numbers the draft and freezes it; one Idempotency-Key per opening, so a retry never issues twice. */
function IssueDialog({ invoice }: { invoice: Invoice }) {
  const { issueInvoice } = useBillingActions();
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const key = React.useRef(newIdempotencyKey());

  React.useEffect(() => {
    if (!open) return;
    key.current = newIdempotencyKey();
    setDate("");
    setError(null);
  }, [open]);

  async function submit() {
    setPending(true);
    setError(null);
    const result = await issueInvoice(invoice.id, key.current, date || undefined);
    setPending(false);
    if (!result.ok) {
      setError(result.fields?.issue_date?.[0] ?? result.error);
      return;
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="primary" size="sm">
          <Send />
          Issue
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Issue this invoice</DialogTitle>
          <DialogDescription>
            It takes the next invoice number and can never be edited again, only voided. Its due date follows the account&apos;s payment terms
            ({invoice.paymentTermsDays > 0 ? `${invoice.paymentTermsDays} days` : "due on receipt"}).
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-2">
          <Label htmlFor="issue-date">Invoice date</Label>
          <Input id="issue-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <p className="text-2xs text-subtle-foreground">Blank: today. An earlier date may not run behind the last invoice issued.</p>
          {error ? (
            <p role="alert" className="text-xs text-critical">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Back
          </Button>
          <Button variant="primary" disabled={pending} onClick={() => void submit()}>
            {pending ? "Issuing…" : "Issue invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A draft line's discount (pesos), saved to the API, which re-totals the invoice. */
function DiscountCell({ invoice, line }: { invoice: Invoice; line: InvoiceLine }) {
  const { setDiscount } = useBillingActions();
  const [value, setValue] = React.useState(String(line.discount));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setValue(String(line.discount)), [line.discount]);

  async function save() {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount === line.discount) return;
    setError(null);
    const result = await setDiscount(invoice.id, line.id, amount);
    if (!result.ok) {
      setError(result.error);
      setValue(String(line.discount));
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Input
        aria-label={`Discount on ${line.description}`}
        inputMode="decimal"
        className="h-8 w-24 text-right"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
        }}
      />
      {error ? <span className="text-2xs text-critical">{error}</span> : null}
    </div>
  );
}

/**
 * One invoice: who it is from and to, what it bills, its VAT breakdown, what
 * has been paid against it, and the next steps the API allows (`can_*`):
 * issue a draft, record a payment, void an unpaid one. The PDF is the
 * printed invoice.
 */
export default function InvoiceDetailPage({ params }: { params: { invoiceId: string } }) {
  const router = useRouter();
  const { data: invoice, error, refetch } = useInvoice(params.invoiceId);
  const { discardInvoice, voidInvoice, downloadInvoicePdf } = useBillingActions();
  const { canAsStaff, staffReason, side } = useCan();
  const [message, setMessage] = React.useState<string | null>(null);

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;
  if (!invoice) return <Skeleton className="h-96" />;

  const draft = invoice.status === "draft";
  const title = invoice.number ?? "Draft invoice";
  const vat = invoice.seller.vatRegistered;

  const actions = (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={async () => {
          setMessage(null);
          const result = await downloadInvoicePdf(invoice.id, `${invoice.number ?? "draft-invoice"}.pdf`);
          if (!result.ok) setMessage(result.error);
        }}
      >
        <Download />
        PDF
      </Button>
      {invoice.canRecordPayment ? <RecordPaymentDialog accountId={invoice.customerAccountId} accountName={invoice.customerName} invoice={invoice} /> : null}
      {draft ? (
        canAsStaff("billing:manage") ? (
          <>
            {invoice.canIssue ? <IssueDialog invoice={invoice} /> : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                setMessage(null);
                const result = await discardInvoice(invoice.id);
                if (!result.ok) setMessage(result.error);
                else router.push(side === "staff" ? "/shop/billing" : "/invoices");
              }}
            >
              <Trash2 />
              Discard draft
            </Button>
          </>
        ) : (
          <DeniedAction reason={staffReason("billing:manage")}>
            <Button variant="primary" size="sm">
              <Send />
              Issue
            </Button>
          </DeniedAction>
        )
      ) : null}
      {invoice.status === "issued" && side === "staff" ? (
        invoice.canVoid ? (
          <ReasonDialog
            trigger={
              <Button variant="ghost" size="sm">
                <Ban className="text-critical" />
                Void
              </Button>
            }
            title={`Void ${invoice.number}`}
            description="The invoice keeps its number and stays on record, marked void, with this reason. Its jobs return to the billing queue."
            confirmLabel="Void invoice"
            onConfirm={(reason) => voidInvoice(invoice.id, reason)}
          />
        ) : (
          <DeniedAction reason={staffReason("billing:void")}>
            <Button variant="ghost" size="sm">
              <Ban />
              Void
            </Button>
          </DeniedAction>
        )
      ) : null}
    </>
  );

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Invoices", href: "/invoices" }, { label: title }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="tabular">{title}</span>
            <InvoiceStatusBadge status={invoice.status} overdueDays={invoice.daysOverdue} />
          </span>
        }
        description={
          draft
            ? "A draft: nothing is numbered or owed until it is issued. Check the lines and any discounts first."
            : `Issued ${invoice.issueDate ? formatDate(invoice.issueDate) : ""} by ${invoice.issuedByName ?? "—"}; due ${invoice.dueDate ? formatDate(invoice.dueDate) : "—"}.`
        }
        actions={actions}
      />

      {message ? (
        <p role="alert" className="mb-4 rounded-lg border border-critical/25 bg-critical/10 px-4 py-2 text-xs text-critical">
          {message}
        </p>
      ) : null}
      {invoice.status === "void" ? (
        <p className="mb-4 rounded-lg border border-border bg-surface-2 px-4 py-2 text-xs text-muted-foreground">
          Voided by {invoice.voidedByName}: {invoice.voidReason}. It keeps its number; its jobs can be invoiced again.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card-raised px-5 py-4">
          <h2 className="text-2xs uppercase tracking-wider text-subtle-foreground">From</h2>
          <p className="mt-1 text-sm font-semibold">{invoice.seller.name}</p>
          {invoice.seller.businessStyle ? <p className="text-xs text-muted-foreground">{invoice.seller.businessStyle}</p> : null}
          {invoice.seller.address ? <p className="whitespace-pre-line text-xs text-muted-foreground">{invoice.seller.address}</p> : null}
          <p className="mt-1 text-xs">
            {vat ? "VAT Reg. TIN" : "Non-VAT Reg. TIN"}: <span className="tabular">{invoice.seller.tin ?? "—"}</span>
            {invoice.seller.branchCode ? <span className="tabular">-{invoice.seller.branchCode}</span> : null}
          </p>
        </section>
        <section className="card-raised px-5 py-4">
          <h2 className="text-2xs uppercase tracking-wider text-subtle-foreground">Sold to</h2>
          <p className="mt-1 text-sm font-semibold">
            {side === "staff" ? (
              <Link href={`/shop/clients/${invoice.customerAccountId}`} className="hover:text-brand">
                {invoice.buyer.name}
              </Link>
            ) : (
              invoice.buyer.name
            )}
          </p>
          <p className="text-xs text-muted-foreground">TIN: {invoice.buyer.tin ?? "—"}</p>
          {invoice.buyer.address ? <p className="whitespace-pre-line text-xs text-muted-foreground">{invoice.buyer.address}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">Terms: {invoice.paymentTermsDays > 0 ? `${invoice.paymentTermsDays} days` : "due on receipt"}</p>
        </section>
      </div>

      <section className="card-raised mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">Description</th>
              <th className="px-3 py-3 text-right font-medium">Qty</th>
              <th className="px-3 py-3 text-right font-medium">Unit price</th>
              <th className="px-3 py-3 text-right font-medium">Discount</th>
              <th className="px-3 py-3 font-medium">Tax</th>
              <th className="px-5 py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <td className="px-5 py-2">{line.description}</td>
                <td className="tabular px-3 py-2 text-right">{formatQuantity(line.quantity)}</td>
                <td className="tabular px-3 py-2 text-right">{formatPesos(line.unitPrice)}</td>
                <td className="tabular px-3 py-2 text-right">
                  {invoice.canEdit ? <DiscountCell invoice={invoice} line={line} /> : line.discount > 0 ? formatPesos(line.discount) : "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{vat ? TAX_LABEL[line.taxClass] : "—"}</td>
                <td className="tabular px-5 py-2 text-right font-medium">{formatPesos(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_minmax(0,380px)]">
        <div className="space-y-4">
          {invoice.workOrders.length > 0 ? (
            <section className="card-raised px-5 py-4">
              <h2 className="text-sm font-semibold">Jobs on this invoice</h2>
              <ul className="mt-2 divide-y divide-border text-xs">
                {invoice.workOrders.map((order) => (
                  <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <Link href={`/work-orders/${order.id}`} className="tabular font-medium hover:text-brand">
                        {order.reference}
                      </Link>
                      <span className="ml-2 text-muted-foreground">{order.title}</span>
                    </span>
                    <span className="text-2xs text-subtle-foreground">{order.completedOn ? `Finished ${formatDate(order.completedOn)}` : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="card-raised px-5 py-4">
            <h2 className="text-sm font-semibold">Payments applied</h2>
            {invoice.payments.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">Nothing has been paid against this invoice.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border text-xs">
                {invoice.payments.map((payment) => (
                  <li key={payment.allocationId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className={payment.counts ? "" : "text-subtle-foreground line-through"}>
                      <span className="tabular font-medium">{payment.number}</span>
                      <span className="ml-2 text-muted-foreground">
                        {formatDate(payment.allocatedOn)}
                        {payment.referenceNo ? ` · ${payment.referenceNo}` : ""}
                      </span>
                      {!payment.counts ? (
                        <Badge tone="outline" className="ml-2">
                          Void
                        </Badge>
                      ) : null}
                    </span>
                    <span className="tabular">{formatPesos(payment.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {invoice.notes ? (
            <section className="card-raised px-5 py-4">
              <h2 className="text-sm font-semibold">Notes</h2>
              <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{invoice.notes}</p>
            </section>
          ) : null}
        </div>

        <section className="card-raised px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold">Totals</h2>
          <dl className="space-y-1.5">
            {vat ? (
              <>
                <MoneyRow label="VATable sales" value={formatPesos(invoice.totals.vatableSales)} />
                <MoneyRow label="VAT-exempt sales" value={formatPesos(invoice.totals.vatExemptSales)} />
                <MoneyRow label="Zero-rated sales" value={formatPesos(invoice.totals.zeroRatedSales)} />
                <MoneyRow label={`VAT (${invoice.vatRatePct}%)`} value={formatPesos(invoice.totals.vatAmount)} />
              </>
            ) : (
              <MoneyRow label="Total sales" value={formatPesos(invoice.totals.nonVatSales)} />
            )}
            {invoice.totals.discountTotal > 0 ? <MoneyRow label="Discounts (already deducted)" value={formatPesos(invoice.totals.discountTotal)} /> : null}
            <MoneyRow label="Total amount due" value={formatPesos(invoice.totals.totalDue)} strong />
            {!draft && invoice.status !== "void" ? (
              <>
                <MoneyRow label="Paid" value={formatPesos(invoice.paid)} />
                <MoneyRow label="Balance" value={formatPesos(invoice.balance)} strong />
              </>
            ) : null}
          </dl>
          <p className="mt-3 text-2xs text-subtle-foreground">
            {vat ? (invoice.pricesIncludeVat ? "Prices include VAT; the VAT shown is extracted from them." : "Prices exclude VAT; VAT is added on top.") : null}
          </p>
          {invoice.nonVatNotice ? <p className="mt-2 text-xs font-semibold">{invoice.nonVatNotice}</p> : null}
        </section>
      </div>
    </>
  );
}
