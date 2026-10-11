import {
  ArrowLeftRight,
  Banknote,
  BookOpen,
  Boxes,
  Building2,
  CalendarCheck,
  CalendarPlus,
  CalendarRange,
  Car,
  ClipboardCheck,
  ClipboardList,
  Cog,
  DoorOpen,
  FileText,
  FolderOpen,
  Gauge,
  History,
  LayoutDashboard,
  LineChart,
  ListChecks,
  Lock,
  MonitorPlay,
  PackageCheck,
  PiggyBank,
  Receipt,
  Scale,
  ScrollText,
  Settings,
  SlidersHorizontal,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Truck,
  UsersRound,
  Warehouse,
  Wrench,
  type LucideIcon,
  Users,
} from "lucide-react";
import type { ModuleKey, UserRole, UserSide } from "@/types";

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
  /** Shown only where the session has this module active (`/me` → `modules.active`). */
  module?: ModuleKey;
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
    label: "Billing",
    items: [
      {
        href: "/invoices",
        label: "Invoices",
        icon: FileText,
        description: "What you owe, what you paid, your statement",
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
    label: "Detailing",
    module: "detailing",
    items: [
      {
        href: "/shop/detailing/new",
        label: "New booking",
        icon: CalendarPlus,
        description: "Take a detailing booking at the counter",
      },
      {
        href: "/shop/detailing",
        label: "Bookings",
        icon: CalendarCheck,
        description: "Every detailing booking and its job card",
      },
      {
        href: "/shop/detailing/schedule",
        label: "Schedule",
        icon: CalendarRange,
        description: "The day by bay and by detailer",
      },
      {
        href: "/shop/detailing/monitor",
        label: "Shop monitor",
        icon: MonitorPlay,
        description: "Today's jobs, live, for the wall screen",
      },
      {
        href: "/shop/detailing/packages",
        label: "Packages & pricing",
        icon: Sparkles,
        description: "The menu, priced per vehicle size",
      },
      {
        href: "/shop/detailing/settings",
        label: "Detailing settings",
        icon: SlidersHorizontal,
        description: "Pool, closing time, online booking, displays",
      },
    ],
  },
  {
    label: "Equipment",
    module: "equipment",
    items: [
      {
        href: "/shop/equipment",
        label: "Health board",
        icon: Gauge,
        description: "Service status, forecast and health of every tool",
      },
      {
        href: "/shop/equipment/register",
        label: "Equipment register",
        icon: ClipboardList,
        description: "Every tool: make, serial, cost, service plan",
      },
      {
        href: "/shop/equipment/profiles",
        label: "Service profiles",
        icon: Cog,
        description: "Which packages put hours on which tools",
      },
    ],
  },
  {
    label: "CRM",
    module: "crm",
    items: [
      {
        href: "/shop/crm",
        label: "Customers",
        icon: Users,
        description: "Every customer, whole: jobs, bills, bookings, notes",
      },
      {
        href: "/shop/crm/tasks",
        label: "Tasks",
        icon: ListChecks,
        description: "Follow-ups, call-backs and booking requests",
      },
      {
        href: "/shop/crm/pipeline",
        label: "Pipeline",
        icon: LineChart,
        description: "B2B leads by stage, to a won account",
      },
      {
        href: "/shop/crm/memberships",
        label: "Memberships & packages",
        icon: PiggyBank,
        description: "Tiers, prepaid plans and packages sold",
      },
      {
        href: "/shop/crm/reminders",
        label: "Reminder rules",
        icon: CalendarCheck,
        description: "What is sent, when, and the quiet hours",
      },
      {
        href: "/shop/crm/templates",
        label: "Templates",
        icon: FileText,
        description: "The wording of every message",
      },
      {
        href: "/shop/crm/messages",
        label: "Message log",
        icon: ScrollText,
        description: "Sent, held and skipped, with the reason",
      },
      {
        href: "/shop/crm/campaigns",
        label: "Segments & campaigns",
        icon: Scale,
        description: "Groups of customers and what is sent to them",
      },
    ],
  },
  {
    label: "Billing",
    items: [
      {
        href: "/shop/billing",
        label: "Billing queue",
        icon: Banknote,
        description: "Finished jobs waiting for an invoice",
      },
      {
        href: "/invoices",
        label: "Invoices",
        icon: FileText,
        description: "Issued, paid and void invoices; payments",
      },
      {
        href: "/shop/receivables",
        label: "Receivables",
        icon: PiggyBank,
        description: "AR aging and revenue, invoiced and received",
      },
    ],
  },
  {
    label: "Books",
    items: [
      {
        href: "/shop/books",
        label: "Chart of accounts",
        icon: BookOpen,
        description: "The accounts every event is booked to",
      },
      {
        href: "/shop/books/rules",
        label: "Posting rules",
        icon: SlidersHorizontal,
        description: "Where each event or category posts; export mapping",
      },
      {
        href: "/shop/books/journal",
        label: "Journal",
        icon: ScrollText,
        description: "Every entry, with the document behind it",
      },
      {
        href: "/shop/books/periods",
        label: "Period close",
        icon: Lock,
        description: "Check a month against its documents, then close it",
      },
      {
        href: "/shop/books/reports",
        label: "Accounting reports",
        icon: Scale,
        description: "Trial balance, ledger, P&L, balance sheet, daily sales",
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
export function navSectionsFor(side: UserSide | undefined, modules?: readonly ModuleKey[]): NavSection[] {
  const sections = side === "staff" ? PROVIDER_NAV_SECTIONS : CLIENT_NAV_SECTIONS;
  // A module's screens are listed only where the API says the module is active for this session.
  return sections.filter((section) => !section.module || (modules ?? []).includes(section.module));
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
