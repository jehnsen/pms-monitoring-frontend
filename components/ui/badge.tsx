import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-2 text-muted-foreground",
        brand: "border-brand/20 bg-brand-muted text-brand",
        ok: "border-ok/25 bg-ok/10 text-ok",
        warning: "border-warning/35 bg-warning/15 text-foreground",
        serious: "border-serious/35 bg-serious/15 text-foreground",
        critical: "border-critical/25 bg-critical/10 text-critical",
        outline: "border-border-strong bg-transparent text-muted-foreground",
      },
      size: {
        sm: "px-2 py-0.5 text-2xs [&_svg]:size-3",
        md: "px-2.5 py-1 text-xs [&_svg]:size-3.5",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, size, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
