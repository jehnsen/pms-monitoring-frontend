import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Wraps a page in a branch's own look. The branch's theme tokens (from the
 * API) are the same names the app's design tokens use (`page`, `surface`,
 * `brand`, `foreground`, …), so setting them as CSS variables on the wrapper
 * re-themes every semantic class inside it; `font-heading` and `font-body`
 * name the fonts, matched to the faces this app has loaded.
 */
const KNOWN_FONTS: Record<string, string> = {
  "Cormorant Garamond": "var(--font-cormorant)",
  "DM Sans": "var(--font-dm-sans)",
};

export function BranchTheme({ tokens, className, children }: { tokens: Record<string, string> | null | undefined; className?: string; children: React.ReactNode }) {
  const style: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens ?? {})) {
    // Tokens are colour triplets and font names only: nothing that could carry a url() or an expression.
    if (key.startsWith("font-")) {
      const face = KNOWN_FONTS[value];
      if (face) style[`--${key}`] = `${face}, ${key === "font-heading" ? "Georgia, serif" : "system-ui, sans-serif"}`;
    } else if (/^[a-z0-9-]+$/.test(key) && /^[0-9.]+ [0-9.]+% [0-9.]+%$/.test(value)) {
      style[`--${key}`] = value;
    }
  }

  return (
    <div
      style={{ ...style, fontFamily: style["--font-body"] } as React.CSSProperties}
      className={cn("min-h-screen bg-page text-foreground [&_h1]:[font-family:var(--font-heading,inherit)] [&_h2]:[font-family:var(--font-heading,inherit)]", className)}
    >
      {children}
    </div>
  );
}
