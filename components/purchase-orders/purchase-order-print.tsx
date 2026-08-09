"use client";

import { formatCurrency, formatDate } from "@/lib/utils";
import type { PurchaseOrder, TenantSettings } from "@/types";

/**
 * The printable/PDF layout for one purchase order.
 *
 * Rendered off-screen at all times (`.po-print-root`'s `display` is flipped
 * by `@media print` in `globals.css`) so `window.print()` can be called
 * directly with no state change or portal — the browser's print pass simply
 * finds it and everything else marked `.no-print` disappears for that pass.
 * "Print" and "Save as PDF" are the same browser dialog, so this one
 * component is both features.
 */
export function PurchaseOrderPrintDocument({
  order,
  tenant,
}: {
  order: PurchaseOrder;
  tenant: TenantSettings;
}) {
  const total = order.lines.reduce(
    (sum, line) => sum + line.quantity * line.unitCost,
    0
  );

  return (
    <div className="po-print-root">
      <div className="mx-auto max-w-2xl p-10 text-black">
        <div className="flex items-start justify-between border-b-2 border-black pb-4">
          <div>
            <h1 className="text-xl font-bold">{tenant.displayName}</h1>
            {tenant.supportEmail ? (
              <p className="text-xs">{tenant.supportEmail}</p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase tracking-wide">
              Purchase Order
            </p>
            <p className="tabular text-sm">{order.reference}</p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <div>
            <dt className="font-semibold">Vendor</dt>
            <dd>{order.vendor}</dd>
          </div>
          <div>
            <dt className="font-semibold">Status</dt>
            <dd className="capitalize">{order.status.replace(/_/g, " ")}</dd>
          </div>
          <div>
            <dt className="font-semibold">Date created</dt>
            <dd>{formatDate(order.createdOn)}</dd>
          </div>
          <div>
            <dt className="font-semibold">Created by</dt>
            <dd>{order.createdBy}</dd>
          </div>
        </dl>

        <table className="mt-6 w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="py-1.5 text-left font-semibold">Description</th>
              <th className="py-1.5 text-right font-semibold">Qty</th>
              <th className="py-1.5 text-right font-semibold">Unit cost</th>
              <th className="py-1.5 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => (
              <tr key={line.id} className="border-b border-black/20">
                <td className="tabular py-1.5">{line.description}</td>
                <td className="tabular py-1.5 text-right">{line.quantity}</td>
                <td className="tabular py-1.5 text-right">
                  {formatCurrency(line.unitCost)}
                </td>
                <td className="tabular py-1.5 text-right">
                  {formatCurrency(line.quantity * line.unitCost)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black font-bold">
              <td colSpan={3} className="py-2 text-right">
                Total
              </td>
              <td className="tabular py-2 text-right">{formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>

        {order.notes ? (
          <div className="mt-6 text-xs">
            <p className="font-semibold">Notes</p>
            <p className="mt-0.5 whitespace-pre-wrap">{order.notes}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
