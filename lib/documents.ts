import {
  BadgeCheck,
  Bus,
  FileCheck2,
  FileText,
  Image,
  Receipt,
  ScrollText,
  ShieldCheck,
  Wind,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { DocumentKind } from "@/types";

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  invoice: "Invoice",
  service_report: "Service report",
  inspection: "Inspection",
  lto_registration: "LTO registration",
  ctpl: "CTPL insurance",
  comprehensive_insurance: "Comprehensive insurance",
  emission_test: "Emission test",
  ltfrb_franchise: "LTFRB franchise",
  warranty: "Warranty",
  photo: "Photo",
  other: "Other",
};

export const DOCUMENT_KIND_ICON: Record<DocumentKind, LucideIcon> = {
  invoice: Receipt,
  service_report: Wrench,
  inspection: FileCheck2,
  lto_registration: ScrollText,
  ctpl: ShieldCheck,
  comprehensive_insurance: ShieldCheck,
  emission_test: Wind,
  ltfrb_franchise: Bus,
  warranty: BadgeCheck,
  photo: Image,
  other: FileText,
};

export const DOCUMENT_KINDS = Object.keys(
  DOCUMENT_KIND_LABEL
) as DocumentKind[];

/** Kinds that carry a renewal date, and therefore raise expiry alerts. */
export const EXPIRING_KINDS: DocumentKind[] = [
  "lto_registration",
  "ctpl",
  "comprehensive_insurance",
  "emission_test",
  "ltfrb_franchise",
  "warranty",
];
