import {
  CalendarRange,
  Car,
  FolderOpen,
  LayoutDashboard,
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
