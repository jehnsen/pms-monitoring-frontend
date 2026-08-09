/**
 * Purchase order export — Excel (.xlsx) and print/PDF.
 *
 * XLSX generation only ever *writes* files here, never parses one — the
 * package's known CVEs (prototype pollution, ReDoS) are both in the read
 * path, which this module never calls.
 *
 * `xlsx` is ~7 MB unpacked (it bundles legacy codepage tables and read
 * support this app never uses), so it is imported dynamically inside each
 * export function rather than at module scope. That keeps it out of
 * `/purchase-orders`'s initial JS entirely — Next.js splits it into its own
 * chunk, fetched only the first time someone actually clicks an export
 * button.
 */
import type { PurchaseOrder } from "@/types";

function lineTotal(order: PurchaseOrder) {
  return order.lines.reduce((total, line) => total + line.quantity * line.unitCost, 0);
}

/** Downloads one workbook. Client-only — relies on `document`/`URL`. */
async function downloadWorkbook(
  workbook: import("xlsx").WorkBook,
  filename: string
) {
  const XLSX = await import("xlsx");
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** One purchase order, one row per line, as an .xlsx download. */
export async function exportPurchaseOrderToExcel(order: PurchaseOrder) {
  const XLSX = await import("xlsx");

  const rows = order.lines.map((line) => ({
    Reference: order.reference,
    Vendor: order.vendor,
    Description: line.description,
    Quantity: line.quantity,
    "Unit cost": line.unitCost,
    "Line total": line.quantity * line.unitCost,
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 14 },
    { wch: 26 },
    { wch: 30 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, order.reference.slice(0, 31));
  await downloadWorkbook(workbook, `${order.reference}.xlsx`);
}

/**
 * Every purchase order passed in, one row per line, as a single .xlsx
 * download — the list page's "Export" action. Takes whatever the caller has
 * already filtered/searched to, so the export matches what's on screen.
 */
export async function exportPurchaseOrdersToExcel(
  orders: PurchaseOrder[],
  filename = "purchase-orders.xlsx"
) {
  const XLSX = await import("xlsx");

  type Row = {
    Reference: string;
    Vendor: string;
    Status: PurchaseOrder["status"];
    Created: string;
    "Created by": string;
    Description: string;
    Quantity: number | "";
    "Unit cost": number | "";
    "Line total": number;
  };

  const rows: Row[] = orders.flatMap((order) =>
    order.lines.length > 0
      ? order.lines.map(
          (line): Row => ({
            Reference: order.reference,
            Vendor: order.vendor,
            Status: order.status,
            Created: order.createdOn,
            "Created by": order.createdBy,
            Description: line.description,
            Quantity: line.quantity,
            "Unit cost": line.unitCost,
            "Line total": line.quantity * line.unitCost,
          })
        )
      : [
          {
            Reference: order.reference,
            Vendor: order.vendor,
            Status: order.status,
            Created: order.createdOn,
            "Created by": order.createdBy,
            Description: "",
            Quantity: "",
            "Unit cost": "",
            "Line total": lineTotal(order),
          },
        ]
  );

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 14 },
    { wch: 26 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 30 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Purchase orders");
  await downloadWorkbook(workbook, filename);
}

export { lineTotal as purchaseOrderTotal };
