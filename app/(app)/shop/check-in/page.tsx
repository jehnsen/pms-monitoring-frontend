"use client";

import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckInWorkflow } from "@/components/shop/check-in-workflow";

export default function CheckInPage() {
  return (
    <>
      <PageHeader
        title="Check in / out"
        description="The counter. Take a vehicle in with a fresh odometer reading, or release one that's finished."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <CheckInWorkflow />
      </Suspense>
    </>
  );
}
