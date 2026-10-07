/**
 * Platform identity — TorqueLane, the product every provider's instance runs
 * on top of.
 *
 * This is distinct from tenant branding (`lib/tenant.ts`'s
 * `DEFAULT_TENANT_SETTINGS`, and `lib/tenancy.ts`'s `providerBranding`): a
 * provider (e.g. MekanikoMoR) and its fleet clients each carry their own
 * name, logo, and brand colour, resolved per session. The platform identity
 * below is what stays constant underneath all of that — the product name on
 * the sign-in screen's footer, the browser tab title template, the support
 * contact when no tenant has overridden it. No "use client": this is plain
 * data, safe to import from a server module as well as a component.
 */

export const PLATFORM_NAME = "TorqueLane";

export const PLATFORM_TAGLINE = "Automotive Service Management Platform";

export const PLATFORM_SUPPORT_EMAIL = "support@torquelane.ph";

/** Default theme tokens a brand-new provider starts from before setting its own. */
export const PLATFORM_DEFAULT_THEME = {
  brandColor: "#1d5ba6",
} as const;
