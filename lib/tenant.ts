import type { FleetClient, Provider, TenantSettings } from "@/types";

/** Current hardcoded values, kept as the default so branding is opt-in, not a breaking change. */
export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  displayName: "MekanikoMoR",
  logoUrl: null,
  brandColor: "#1d5ba6", // matches --brand: 213 72% 39% in light mode
  supportEmail: "support@mekanikomore.ph",
};

/**
 * The tenancy root the existing demo collapses into: everything that shipped
 * before tenancy existed belongs to this one provider and this one client, so
 * the seeded fleet and any payload already in a browser keep working unchanged.
 * `normalise()` in `lib/store.ts` backfills against these ids.
 */
export const SEED_PROVIDER: Provider = {
  id: "prov-mekanikomore",
  name: "MekanikoMoR",
  slug: "mekanikomore",
  logoUrl: null,
  brandColor: "#1d5ba6",
  supportEmail: "support@mekanikomore.ph",
  createdAt: "2024-01-01",
};

/**
 * Client ids as constants so `lib/auth.ts` can pin demo accounts to a tenant
 * without importing the whole seed module.
 */
export const FLEET_CLIENT_IDS = {
  actimed: "fc-actimed",
  northwind: "fc-northwind",
  sagrada: "fc-sagrada",
  bayani: "fc-bayani",
} as const;

export const SEED_FLEET_CLIENT: FleetClient = {
  id: FLEET_CLIENT_IDS.actimed,
  providerId: SEED_PROVIDER.id,
  name: "Actimed",
  slug: "actimed",
  contactName: "Marisol Bautista",
  contactEmail: "fleet@actimed.ph",
  contractTerms: "Full-service PMS retainer, 16 units",
  paymentTermsDays: 30,
  approvalThresholdOverrides: null,
  logoUrl: null,
  brandColor: "#0f7a5a",
  status: "active",
  createdAt: "2024-01-01",
};

/** Parses a `#rgb` or `#rrggbb` hex colour into an `"H S% L%"` triplet for a CSS custom property. */
export function hexToHslTriplet(hex: string): string | null {
  const normalised = hex.trim().replace(/^#/, "");
  const full =
    normalised.length === 3
      ? normalised.split("").map((c) => c + c).join("")
      : normalised;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return `0 0% ${Math.round(l * 100)}%`;

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  h *= 60;

  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** White text reads better on darker brand colours, near-black on lighter ones. */
export function hexRelativeLuminance(hex: string): number | null {
  const normalised = hex.trim().replace(/^#/, "");
  const full =
    normalised.length === 3
      ? normalised.split("").map((c) => c + c).join("")
      : normalised;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;

  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  const r = channel(parseInt(full.slice(0, 2), 16));
  const g = channel(parseInt(full.slice(2, 4), 16));
  const b = channel(parseInt(full.slice(4, 6), 16));

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** `"H S% L%"` for `--brand-foreground` — white on a dark brand colour, near-black on a light one. */
export function brandForegroundTriplet(hex: string): string {
  const luminance = hexRelativeLuminance(hex);
  return luminance !== null && luminance > 0.5 ? "222 20% 12%" : "0 0% 100%";
}
