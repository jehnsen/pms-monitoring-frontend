/**
 * The platform's own identity — the product, as opposed to any tenant on it.
 *
 * Two kinds of name appear in this app and they must not be confused:
 *
 *   - **Platform** (this file): the software itself. Shown where no tenant is
 *     in play yet or at all — the sign-in screen, page metadata, the loading
 *     mark, the marketing walkthrough, and the fail-closed fallback when a
 *     session resolves to no provider.
 *   - **Tenant** (`providerBranding` in `lib/tenancy.ts`): the service centre
 *     running an instance, or the fleet client signed into it. Shown inside
 *     the app once a scope resolves. The demo provider happens to be called
 *     MekanikoMoR; that is tenant data in the seed, not the product name.
 *
 * Pure data, no imports, so it is safe anywhere (server components included).
 */

export const PLATFORM = {
  productName: "TorqueLane",
  /** Used in titles and the sign-in footer. */
  productDescription: "Automotive Service Management",
  /**
   * Platform-level support, for problems that are not a tenant's to answer
   * (sign-in, an unresolvable account). Tenant support stays with the provider
   * (`TenantSettings.supportEmail`).
   */
  supportEmail: "support@torquelane.ph",
} as const;

/**
 * Default theme tokens, applied when no tenant colour overrides them.
 *
 * `brandColor` is what `components/layout/tenant-branding.tsx` writes into
 * `--brand` for an unbranded tenant. The `css` triplets mirror `--brand` in
 * `app/globals.css` for `:root` and `[data-theme="dark"]` — change the two
 * together.
 */
export const PLATFORM_THEME = {
  brandColor: "#1d5ba6",
  css: {
    light: { brand: "217 91% 53%", brandForeground: "0 0% 100%" },
    dark: { brand: "216 100% 73%", brandForeground: "222 39% 12%" },
  },
} as const;

/** The default document title, e.g. on the sign-in page. */
export const PLATFORM_TITLE = `${PLATFORM.productName} — ${PLATFORM.productDescription}`;
