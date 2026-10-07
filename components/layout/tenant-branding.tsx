"use client";

import { useEffect } from "react";
import { useFleet } from "@/lib/store";
import { useTheme } from "@/components/theme-provider";
import { brandForegroundTriplet, hexToHslTriplet } from "@/lib/tenant";

/**
 * Applies tenant branding to the two surfaces that live outside React's
 * render tree: the document title and the `--brand`/`--brand-foreground` CSS
 * custom properties `Button`'s primary variant reads. Renders nothing —
 * mount once, inside `AuthGuard`, since tenant settings only exist once the
 * fleet store has hydrated.
 */
export function TenantBranding() {
  const { ready, tenant } = useFleet();
  const { theme } = useTheme();

  useEffect(() => {
    if (!ready) return;
    const previousTitle = document.title;
    document.title = `${tenant.displayName} — Automotive Service Management`;

    const brandTriplet = hexToHslTriplet(tenant.brandColor);
    if (brandTriplet) {
      const [hue, saturation, lightness] = brandTriplet.split(" ");
      const darkBrand = `${hue} ${saturation} ${Math.max(68, parseFloat(lightness))}%`;
      document.documentElement.style.setProperty("--brand", theme === "dark" ? darkBrand : brandTriplet);
      document.documentElement.style.setProperty(
        "--brand-foreground",
        theme === "dark" ? "222 39% 12%" : brandForegroundTriplet(tenant.brandColor)
      );
      document.documentElement.style.setProperty(
        "--brand-muted",
        `${hue} ${saturation} ${theme === "dark" ? "18%" : "96%"}`
      );
    }

    return () => {
      document.title = previousTitle;
      for (const token of ["--brand", "--brand-foreground", "--brand-muted"]) {
        document.documentElement.style.removeProperty(token);
      }
    };
  }, [ready, tenant.displayName, tenant.brandColor, theme]);

  return null;
}
