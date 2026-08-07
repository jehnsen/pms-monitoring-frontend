"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth";
import { homeHrefFor } from "@/lib/nav";

/**
 * Role-aware entry. The two sides of the application have different home
 * screens, and which one you belong to lives in the session — which lives in
 * localStorage — so this has to resolve on the client rather than as a server
 * redirect. `AuthGuard` handles the signed-out case on the destination.
 */
export default function Home() {
  const router = useRouter();
  const { session, ready } = useSession();

  useEffect(() => {
    if (!ready) return;
    router.replace(session ? homeHrefFor(session.role) : "/login");
  }, [ready, session, router]);

  return null;
}
