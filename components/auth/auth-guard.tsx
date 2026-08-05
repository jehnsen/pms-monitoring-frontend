"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { useSession } from "@/lib/auth";

/** Shown while the session resolves, and again during the redirect out. */
function Holding() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page">
      <div className="flex flex-col items-center gap-4">
        <Logo />
        <span
          className="size-5 animate-spin rounded-full border-2 border-border-strong border-t-brand"
          role="status"
          aria-label="Loading"
        />
      </div>
    </div>
  );
}

/**
 * Gates the application shell. The session lives in localStorage, so the first
 * paint genuinely doesn't know whether anyone is signed in — `ready` has to be
 * respected or every load would flash the login screen.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, ready } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !session) {
      const next = encodeURIComponent(pathname);
      router.replace(`/login?next=${next}`);
    }
  }, [ready, session, router, pathname]);

  if (!ready || !session) return <Holding />;

  return <>{children}</>;
}
