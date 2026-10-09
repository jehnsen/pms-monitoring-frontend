import type { Metadata } from "next";
import { SetPasswordForm } from "@/components/auth/set-password-form";

export const metadata: Metadata = { title: "Reset password" };

/** The API's reset email links here: `/reset-password?token=…&email=…`. */
export default function ResetPasswordPage({ searchParams }: { searchParams: { token?: string; email?: string } }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-16">
      <SetPasswordForm mode="reset" token={searchParams.token} email={searchParams.email} />
    </main>
  );
}
