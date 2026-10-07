import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function FleetMetric({ label, value, detail, icon: Icon, href, tone = "brand", featured = false }: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  href: string;
  tone?: "brand" | "critical" | "warning" | "ok";
  featured?: boolean;
}) {
  const iconTone = {
    brand: "bg-brand-muted text-brand",
    critical: "bg-critical/10 text-critical",
    warning: "bg-warning/15 text-foreground",
    ok: "bg-ok/10 text-ok",
  }[tone];

  return (
    <Link href={href} className={cn(
      "group flex min-w-0 flex-col rounded-xl border p-5 transition-[border-color,box-shadow] hover:shadow-md",
      featured ? "workspace-banner border-chrome-border" : "border-border bg-surface hover:border-brand/35"
    )}>
      <div className="flex items-center justify-between gap-3">
        <p className={cn("text-xs font-medium", featured ? "text-chrome-muted" : "text-muted-foreground")}>{label}</p>
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", featured ? "bg-chrome-active/10 text-chrome-active" : iconTone)}>
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
      </div>
      <p className="mt-3 break-words text-[32px] font-semibold leading-none tracking-[-0.045em]">{value}</p>
      <div className={cn("mt-4 flex items-center justify-between gap-2 text-[11px] leading-relaxed", featured ? "text-chrome-muted" : "text-subtle-foreground")}>
        <span>{detail}</span>
        <ArrowUpRight className={cn("size-3.5 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5", featured ? "text-chrome-active" : "text-subtle-foreground group-hover:text-brand")} />
      </div>
    </Link>
  );
}
