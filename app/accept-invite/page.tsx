import type { Metadata } from "next";
import { SetPasswordForm } from "@/components/auth/set-password-form";

export const metadata: Metadata = { title: "Accept invitation" };

/** The API's invitation email links here: `/accept-invite?token=…`. */
export default function AcceptInvitePage({ searchParams }: { searchParams: { token?: string } }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-16">
      <SetPasswordForm mode="invite" token={searchParams.token} />
    </main>
  );
}
