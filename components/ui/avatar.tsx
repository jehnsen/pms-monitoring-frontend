import { cn, initials } from "@/lib/utils";

/**
 * Initials avatar. The hue is derived from the name so the same person keeps the
 * same chip across the app — decorative only, never load-bearing.
 */
export function Avatar({
  name,
  className,
  size = "md",
}: {
  name: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const hue = [...name].reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-border font-semibold uppercase",
        size === "sm" ? "size-6 text-[9px]" : "size-8 text-2xs",
        className
      )}
      style={{
        backgroundColor: `hsl(${hue} 45% 92%)`,
        color: `hsl(${hue} 55% 28%)`,
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
