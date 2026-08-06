"use client";

import { useEffect } from "react";
import { useFleet } from "@/lib/store";
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

  useEffect(() => {
    if (!ready) return;
    document.title = `${tenant.displayName} — Fleet PMS & Maintenance`;

    const brandTriplet = hexToHslTriplet(tenant.brandColor);
    if (brandTriplet) {
      document.documentElement.style.setProperty("--brand", brandTriplet);
      document.documentElement.style.setProperty(
        "--brand-foreground",
        brandForegroundTriplet(tenant.brandColor)
      );
    }
  }, [ready, tenant.displayName, tenant.brandColor]);

  return null;
}
