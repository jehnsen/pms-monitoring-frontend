"use client";

import { ChevronDown, FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportPurchaseOrderToExcel } from "@/lib/po-export";
import type { PurchaseOrder } from "@/types";

/**
 * Print/PDF + Excel export trigger for one purchase order.
 *
 * "Print" and "Save as PDF" are the same browser action — `window.print()`
 * opens one dialog and the destination (a physical printer vs. "Save as
 * PDF") is the user's choice inside it, not something this code picks.
 *
 * Printing is two steps rather than one because only one order's document
 * may exist in the `.po-print-root` DOM node at a time (see
 * `PurchaseOrderPrintDocument` / globals.css): if every row in a list
 * rendered its own hidden copy, the print stylesheet would show all of them
 * at once. `onPrint` asks the parent to mount that one order's document,
 * then this component fires the print dialog on the next frame once it's in
 * the DOM.
 */
export function PurchaseOrderExportMenu({
  order,
  onPrint,
}: {
  order: PurchaseOrder;
  /** Mounts `order` into the page's single `PurchaseOrderPrintDocument`. */
  onPrint: (order: PurchaseOrder) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm">
          Print / export
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            onPrint(order);
            // The document needs a paint before print() can see it.
            requestAnimationFrame(() => window.print());
          }}
        >
          <Printer />
          Print / save as PDF
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void exportPurchaseOrderToExcel(order)}>
          <FileSpreadsheet />
          Export to Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
