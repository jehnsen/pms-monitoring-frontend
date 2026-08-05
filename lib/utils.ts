import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

export function formatCurrency(value: number) {
  return peso.format(value);
}

/** Compact form for axis ticks and tiles, e.g. ₱1.2M. */
export function formatCurrencyCompact(value: number) {
  if (Math.abs(value) >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `₱${Math.round(value / 1_000)}k`;
  return `₱${Math.round(value)}`;
}

export function formatKm(value: number) {
  return `${Math.round(value).toLocaleString("en-US")} km`;
}

export function formatKmCompact(value: number) {
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k km`;
  return `${Math.round(value)} km`;
}

export function formatDate(iso: string) {
  return format(parseISO(iso), "dd MMM yyyy");
}

export function formatDateShort(iso: string) {
  return format(parseISO(iso), "dd MMM");
}

export function formatRelative(iso: string) {
  return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true });
}

/**
 * Human phrasing for a day delta that reads correctly on both sides of zero —
 * "5 days overdue" is clearer than "-5 days remaining".
 */
export function formatDayDelta(days: number) {
  if (days === 0) return "Due today";
  if (days < 0) {
    const n = Math.abs(days);
    return `${n} ${n === 1 ? "day" : "days"} overdue`;
  }
  return `in ${days} ${days === 1 ? "day" : "days"}`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function titleCase(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

/** Groups by a derived key, preserving insertion order of first appearance. */
export function groupBy<T, K extends string>(items: T[], key: (item: T) => K) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    (acc[k] ??= []).push(item);
    return acc;
  }, {});
}
