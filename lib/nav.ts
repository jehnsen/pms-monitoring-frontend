import {
  ArrowLeftRight,
  Boxes,
  Building2,
  CalendarRange,
  Car,
  ClipboardCheck,
  ClipboardList,
  DoorOpen,
  FolderOpen,
  History,
  LayoutDashboard,
  LineChart,
  ListChecks,
  PackageCheck,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Truck,
  UsersRound,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { UserRole, UserSide } from "@/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
  /** Resolved to a live count by `SidebarNav` — currently only "requestsForMe". */
  dynamicBadge?: "requestsForMe";
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * Client-side navigation — the fleet operator's job. Reached by every
 * client-side role; a provider user never sees it.
 */
export const CLIENT_NAV_SECTIONS: NavSection[] = [
  {
    label: "Monitor",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        description: "Fleet health at a glance",
      },
      {
        href: "/vehicles",
        label: "Vehicles",
        icon: Car,
        description: "Every unit and its PMS state",
      },
      {
        href: "/schedule",
        label: "Schedule",
        icon: CalendarRange,
        description: "What falls due, and when",
      },
    ],
  },
  {
    label: "Maintain",
    items: [
      {
        href: "/work-orders",
        label: "Work orders",
        icon: Wrench,
        description: "Open, scheduled, and closed jobs",
      },
      {
        href: "/documents",
        label: "Documents",
        icon: FolderOpen,
        description: "Invoices, reports, and policies",
      },
      {
        href: "/reports",
        label: "Reports",
        icon: TrendingUp,
        description: "Cost and compliance analysis",
      },
    ],
  },
  {
    label: "Procure",
    items: [
      {
        href: "/requests",
        label: "Requests",
        icon: ClipboardCheck,
        description: "Purchases awaiting approval",
        dynamicBadge: "requestsForMe",
      },
      {
        href: "/demand-forecast",
        label: "Demand forecast",
        icon: LineChart,
        description: "Parts the schedule says you'll need",
      },
      {
        href: "/purchase-orders",
        label: "Purchase orders",
        icon: Receipt,
        description: "Issued and pending POs",
      },
    ],
  },
  {
    label: "Configure",
    items: [
      {
        href: "/service-catalogue",
        label: "Service catalogue",
        icon: ListChecks,
        description: "The PMS interval schedule",
      },
      {
        href: "/access",
        label: "User access",
        icon: ShieldCheck,
        description: "Roles and permissions",
      },
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        description: "Thresholds, branding, and data",
      },
    ],
  },
];

/**
 * Provider-side navigation — the service centre's own job, which is a
 * different one: bays and a book of work across every client, not one fleet's
 * compliance. Deliberately not a superset of the client nav.
 */
export const PROVIDER_NAV_SECTIONS: NavSection[] = [
  {
    label: "Floor",
    items: [
      {
        href: "/shop",
        label: "Shop today",
        icon: LayoutDashboard,
        description: "What is happening in the bays",
      },
      {
        href: "/shop/queue",
        label: "Job queue",
        icon: ClipboardList,
        description: "Every active job, all clients",
      },
      {
        href: "/shop/check-in",
        label: "Check in / out",
        icon: DoorOpen,
        description: "The counter workflow",
      },
    ],
  },
  {
    label: "Book of work",
    items: [
      {
        href: "/shop/clients",
        label: "Clients",
        icon: Building2,
        description: "Fleets under this provider",
      },
      {
        href: "/shop/technicians",
        label: "Technicians",
        icon: UsersRound,
        description: "Roster, load, and variance",
      },
      {
        href: "/shop/vendors",
        label: "Vendors",
        icon: Truck,
        description: "Approved repair vendors",
      },
      {
        href: "/shop/reports",
        label: "Reports",
        icon: TrendingUp,
        description: "Revenue, utilisation, and mix",
      },
    ],
  },
  {
    label: "Stock room",
    items: [
      {
        href: "/shop/inventory",
        label: "Items",
        icon: Boxes,
        description: "Parts, consumables and fees the shop keeps",
      },
      {
        href: "/shop/inventory/stock",
        label: "Stock on hand",
        icon: Warehouse,
        description: "What is on the shelf, and what it is worth",
      },
      {
        href: "/shop/inventory/movements",
        label: "Item movements",
        icon: History,
        description: "Every receipt, issue and adjustment",
      },
      {
        href: "/shop/inventory/purchasing",
        label: "Receive PO",
        icon: PackageCheck,
        description: "Purchase orders and goods received",
      },
      {
        href: "/shop/inventory/counts",
        label: "Stock count",
        icon: ClipboardCheck,
        description: "Count the shelf, post the variances",
      },
      {
        href: "/shop/inventory/transfers",
        label: "Transfers",
        icon: ArrowLeftRight,
        description: "Stock moved between branches",
      },
      {
        href: "/shop/inventory/reorder",
        label: "Reorder",
        icon: ShoppingCart,
        description: "What to buy, from stock and the forecast",
      },
    ],
  },
  {
    label: "Configure",
    items: [
      {
        href: "/service-catalogue",
        label: "Service catalogue",
        icon: ListChecks,
        description: "The PMS interval schedule",
      },
      {
        href: "/access",
        label: "User access",
        icon: ShieldCheck,
        description: "Roles and permissions",
      },
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        description: "Branding, thresholds, and data",
      },
    ],
  },
];

/** The nav for whichever side of the tenancy boundary the session sits on (`/me` → `side`). */
export function navSectionsFor(side: UserSide | undefined): NavSection[] {
  return side === "staff" ? PROVIDER_NAV_SECTIONS : CLIENT_NAV_SECTIONS;
}

/** Where a bare sign-in lands. The two sides have different home screens. */
export function homeHrefFor(side: UserSide | undefined, role?: UserRole): string {
  if (side === "staff") return "/shop";
  // Purchasing officers live in the approval queue, not the dashboard.
  return role === "purchasing_officer" ? "/requests" : "/dashboard";
}

export const NAV_ITEMS = [
  ...CLIENT_NAV_SECTIONS,
  ...PROVIDER_NAV_SECTIONS,
].flatMap((section) => section.items);
