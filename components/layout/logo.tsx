import { cn } from "@/lib/utils";

/**
 * Wordmark. The glyph is an axle: two hubs on a shaft, with the upper arc
 * standing in for the service interval that closes over it.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground shadow-xs">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="size-[18px]"
          aria-hidden
        >
          <path
            d="M5 15.5h14"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <circle cx="5" cy="15.5" r="2.6" stroke="currentColor" strokeWidth="1.9" />
          <circle cx="19" cy="15.5" r="2.6" stroke="currentColor" strokeWidth="1.9" />
          <path
            d="M4.6 9.6A8 8 0 0 1 19.4 9.6"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-sm font-semibold tracking-tight">Axle</span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-subtle-foreground">
          Fleet PMS
        </span>
      </span>
    </span>
  );
}
