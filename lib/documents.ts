import {
  BadgeCheck,
  FileCheck2,
  FileText,
  Image,
  Receipt,
  ScrollText,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { DocumentKind } from "@/types";

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  invoice: "Invoice",
  service_report: "Service report",
  inspection: "Inspection",
  insurance: "Insurance",
  registration: "Registration",
  warranty: "Warranty",
  photo: "Photo",
  other: "Other",
};

export const DOCUMENT_KIND_ICON: Record<DocumentKind, LucideIcon> = {
  invoice: Receipt,
  service_report: Wrench,
  inspection: FileCheck2,
  insurance: ShieldCheck,
  registration: ScrollText,
  warranty: BadgeCheck,
  photo: Image,
  other: FileText,
};

export const DOCUMENT_KINDS = Object.keys(
  DOCUMENT_KIND_LABEL
) as DocumentKind[];

/** Kinds that carry a renewal date, and therefore raise expiry alerts. */
export const EXPIRING_KINDS: DocumentKind[] = [
  "insurance",
  "registration",
  "warranty",
];
