"use client";

import Link from "next/link";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useCan } from "@/lib/rbac";
import { isProviderRole } from "@/lib/tenancy";
import { homeHrefFor } from "@/lib/nav";

/**
 * The shop floor is the service centre's own side of the application. A
 * client-side session has no business here — it would be looking at every
 * other client's work — so the whole route group is gated in one place rather
 * than page by page.
 *
 * As ever this is a UI affordance; the data itself is narrowed by
 * `lib/tenancy.ts`, which is what actually keeps a client's session from
 * seeing across the boundary.
 */
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  const { role } = useCan();

  if (role && !isProviderRole(role)) {
    return (
      <div className="card">
        <EmptyState
          icon={Store}
          title="This is the service centre's view"
          description="The shop floor belongs to the provider. Your account is scoped to a single fleet, which has its own dashboard."
          action={
            <Button asChild variant="primary">
              <Link href={homeHrefFor(role)}>Go to my dashboard</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}
