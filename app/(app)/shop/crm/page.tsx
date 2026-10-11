"use client";

import * as React from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { formatDay } from "@/components/detailing/booking-status";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { pesos } from "@/lib/api/crm";
import { useCrmCustomers } from "@/lib/crm";

/**
 * Customers, as the CRM sees them: every account of the organization (not of
 * one branch), with what each has paid, when they were last served, their
 * tier and their open tasks. All figures are the API's.
 */
export default function CrmCustomersPage() {
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const { data, error, refetch } = useCrmCustomers({ q: search.trim() || undefined, page });

  if (error) return <QueryError error={error} onRetry={() => void refetch()} />;

  return (
    <>
      <PageHeader title="Customers" description="Every customer account, across all branches. Open one for its jobs, bills, bookings, notes, tasks and timeline." />

      <div className="mb-4 max-w-sm">
        <Input
          type="search"
          aria-label="Search customers"
          placeholder="Search by name"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </div>

      {!data ? (
        <Skeleton className="h-96" />
      ) : data.data.length === 0 ? (
        <div className="card">
          <EmptyState icon={Users} title="No customers found" description={search ? "No customer matches that search." : "Customers appear here as accounts are opened."} />
        </div>
      ) : (
        <section className="card-raised overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Customer</th>
                <th scope="col" className="px-3 py-3 font-medium">Tier</th>
                <th scope="col" className="px-3 py-3 font-medium">Last visit</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Paid to date</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Open tasks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.data.map((customer) => (
                <tr key={customer.id} className="hover:bg-surface-2/60">
                  <td className="px-5 py-3">
                    <Link href={`/shop/crm/customers/${customer.id}`} className="font-medium text-brand hover:underline">
                      {customer.displayName}
                    </Link>
                    <p className="flex flex-wrap items-center gap-1.5 text-2xs capitalize text-subtle-foreground">
                      {customer.accountType}
                      {customer.status !== "active" ? <Badge tone="warning">{customer.status}</Badge> : null}
                      {customer.tags.map((tag) => (
                        <Badge key={tag} tone="outline">
                          {tag}
                        </Badge>
                      ))}
                    </p>
                  </td>
                  <td className="px-3 py-3">{customer.tierName ?? <span className="text-subtle-foreground">—</span>}</td>
                  <td className="px-3 py-3">{customer.lastVisitOn ? formatDay(customer.lastVisitOn) : <span className="text-subtle-foreground">Never</span>}</td>
                  <td className="tabular px-3 py-3 text-right">{pesos(customer.spendCents)}</td>
                  <td className="tabular px-5 py-3 text-right">{customer.openTasks}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-border px-5 py-3">
            <Pagination page={data.meta.page} pageCount={Math.max(1, Math.ceil(data.meta.total / data.meta.perPage))} pageSize={data.meta.perPage} totalItems={data.meta.total} onPageChange={setPage} onPageSizeChange={() => undefined} />
          </div>
        </section>
      )}
    </>
  );
}
