import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";

/**
 * Public booking pages. A branch's look arrives as theme tokens from the API;
 * the two faces the Samahuzai look names are loaded here so `BranchTheme` can
 * use them.
 */
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-cormorant", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });

export const metadata: Metadata = { title: "Book a detail" };

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${cormorant.variable} ${dmSans.variable}`}>{children}</div>;
}
