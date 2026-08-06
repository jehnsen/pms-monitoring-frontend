import {
  Building2,
  CalendarRange,
  Car,
  ClipboardCheck,
  FolderOpen,
  LayoutDashboard,
  LineChart,
  Receipt,
  Settings,
  ShieldCheck,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from "lucide-react";

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

export const NAV_SECTIONS: NavSection[] = [
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
      {
        href: "/vendors",
        label: "Vendors",
        icon: Building2,
        description: "Approved service providers",
      },
    ],
  },
  {
    label: "Configure",
    items: [
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
        description: "Intervals, thresholds, and data",
      },
    ],
  },
];

export const NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);
