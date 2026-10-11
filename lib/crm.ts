"use client";

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, apiData, newIdempotencyKey } from "@/lib/api/client";
import { BILLING_ROOTS } from "@/lib/api/billing";
import { camel, CRM_ROOT } from "@/lib/api/crm";
import { DETAILING_ROOT } from "@/lib/api/detailing";
import { run, useApiQuery, type ActionResult } from "@/lib/store";
import type {
  CampaignProgress,
  CrmCampaign,
  CrmCustomerRow,
  CrmLead,
  CrmMessage,
  CrmOptions,
  CrmSegment,
  CrmSettings,
  CrmTask,
  Customer360,
  CustomerBenefits,
  FeedbackAnswer,
  MembershipTier,
  MessageTemplate,
  NpsSummary,
  PipelineBoard,
  PrepaidPackage,
  PrepaidPlan,
  ReminderRuleRow,
  SegmentFilters,
  TaskSummary,
  TemplateMeta,
} from "@/types/crm";

/**
 * The CRM's data, in the same shape as the other seams: one hook per endpoint
 * (keyed by the user and the selected branch) and `useCrmActions()` for the
 * writes. Nothing is optimistic and nothing is computed here. A CRM record is
 * the organization's, so these lists do not narrow with the branch switcher.
 *
 * Selling a prepaid package and redeeming a credit post to the books, and a
 * redemption settles a detailing job: those writes also refresh
 * `BILLING_ROOTS` (which carries the books) and the detailing queries.
 */

type Raw = Record<string, unknown>;
type Query = Record<string, string | number | boolean | undefined>;
type Paged<T, S = undefined> = { data: T[]; meta: { page: number; perPage: number; total: number }; summary: S };

const list = async <T, S = undefined>(path: string, query?: Query): Promise<Paged<T, S>> => camel<Paged<T, S>>(await api<Raw>(path, { query }));
const one = async <T>(path: string, query?: Query): Promise<T> => camel<T>(await apiData<Raw>(path, { query }));

export const useCrmOptions = () => useApiQuery<CrmOptions>([CRM_ROOT, "options"], () => one("/crm/options"));
export const useCrmCustomers = (params: { q?: string; page?: number }) => useApiQuery([CRM_ROOT, "customers", params], () => list<CrmCustomerRow>("/crm/customers", params), { keepPrevious: true });
export const useCustomer360 = (id: string | undefined) => useApiQuery<Customer360>([CRM_ROOT, "customer", id], () => one(`/crm/customers/${id}`), { enabled: Boolean(id) });
export const useCustomerBenefits = (id: string | undefined) => useApiQuery<CustomerBenefits>([CRM_ROOT, "benefits", id], () => one(`/crm/customers/${id}/benefits`), { enabled: Boolean(id) });
export const useCrmTasks = (params: { status?: string; mine?: boolean; page?: number }) =>
  useApiQuery([CRM_ROOT, "tasks", params], () => list<CrmTask, TaskSummary>("/crm/tasks", { ...params, mine: params.mine ? 1 : undefined }), { keepPrevious: true });
export const usePipeline = (mine: boolean) => useApiQuery<PipelineBoard>([CRM_ROOT, "leads", mine], () => one("/crm/leads", { mine: mine ? 1 : undefined }));
export const useCrmSettings = () => useApiQuery<CrmSettings>([CRM_ROOT, "settings"], () => one("/crm/settings"));
export const useTemplates = () =>
  useApiQuery([CRM_ROOT, "templates"], async () => camel<{ data: MessageTemplate[]; meta: TemplateMeta }>(await api<Raw>("/crm/templates")));
export const useReminderRules = () => useApiQuery<ReminderRuleRow[]>([CRM_ROOT, "rules"], () => one("/crm/reminder-rules"));
export const useMessages = (params: { status?: string; purpose?: string; source_type?: string; page?: number }) =>
  useApiQuery([CRM_ROOT, "messages", params], () => list<CrmMessage, Record<"queued" | "sent" | "failed" | "skipped", number>>("/crm/messages", params), { keepPrevious: true });
export const useFeedback = () => useApiQuery([CRM_ROOT, "feedback"], async () => camel<{ data: FeedbackAnswer[]; summary: NpsSummary }>(await api<Raw>("/crm/feedback")));
export const useTiers = () => useApiQuery<MembershipTier[]>([CRM_ROOT, "tiers"], () => one("/crm/tiers"));
export const usePrepaidPlans = () => useApiQuery<PrepaidPlan[]>([CRM_ROOT, "plans"], () => one("/crm/prepaid-plans"));
export const usePrepaidPackages = (page: number) =>
  useApiQuery([CRM_ROOT, "packages", page], () => list<PrepaidPackage, { sold: number; soldCents: number; unearnedCents: number }>("/crm/prepaid-packages", { page }), { keepPrevious: true });
export const useSegments = () => useApiQuery<CrmSegment[]>([CRM_ROOT, "segments"], () => one("/crm/segments"));
export const useCampaigns = () => useApiQuery<CrmCampaign[]>([CRM_ROOT, "campaigns"], () => one("/crm/campaigns"));

/** Drop empty optional strings (the API turns "" into null); keep everything else. */
function compact(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined && !(typeof value === "string" && value.trim() === "")));
}

export function useCrmActions() {
  const queryClient = useQueryClient();
  const refresh = useCallback(
    (also: readonly string[]) => {
      const roots = new Set<unknown>([CRM_ROOT, ...also]);
      return queryClient.invalidateQueries({ predicate: (query) => roots.has(query.queryKey[0]) });
    },
    [queryClient]
  );
  const write = useCallback(
    async <T,>(fn: () => Promise<T>, also: readonly string[] = []): Promise<ActionResult<T>> => {
      const result = await run(fn);
      if (result.ok) await refresh(also);
      return result;
    },
    [refresh]
  );
  const send = useCallback(<T,>(method: "POST" | "PUT", path: string, body?: Record<string, unknown>, idempotent = false) => async () => camel<T>(await apiData<Raw>(path, { method, body, ...(idempotent ? { idempotencyKey: newIdempotencyKey() } : {}) })), []);

  return useMemo(
    () => ({
      addNote: (accountId: string, body: string) => write(send("POST", `/crm/customers/${accountId}/notes`, { body: body.trim() })),
      pinNote: (accountId: string, noteId: string, pinned: boolean) => write(send("PUT", `/crm/customers/${accountId}/notes/${noteId}`, { pinned })),
      deleteNote: (accountId: string, noteId: string) => write(async () => void (await api(`/crm/customers/${accountId}/notes/${noteId}`, { method: "DELETE" }))),

      saveTask: (task: { title: string; details?: string; kind?: string; customerAccountId?: string | null; leadId?: string | null; assigneeId?: string | null; dueOn?: string; remindAt?: string }, id?: string) =>
        write(
          send<CrmTask>(
            id ? "PUT" : "POST",
            id ? `/crm/tasks/${id}` : "/crm/tasks",
            compact({
              title: task.title.trim(),
              details: task.details,
              kind: task.kind,
              customer_account_id: task.customerAccountId ?? undefined,
              lead_id: task.leadId ?? undefined,
              assignee_id: task.assigneeId === null ? undefined : task.assigneeId,
              due_on: task.dueOn,
              // The browser's local time, sent as an instant with its offset.
              remind_at: task.remindAt ? new Date(task.remindAt).toISOString() : undefined,
            })
          )
        ),
      setTaskStatus: (id: string, status: CrmTask["status"]) => write(send<CrmTask>("POST", `/crm/tasks/${id}/status`, { status })),

      saveLead: (lead: { companyName: string; contactName?: string; contactEmail?: string; contactPhone?: string; value?: string; nextStep?: string; nextStepOn?: string; source?: string; isDealer?: boolean; notes?: string; ownerId?: string }, id?: string) =>
        write(
          send<CrmLead>(
            id ? "PUT" : "POST",
            id ? `/crm/leads/${id}` : "/crm/leads",
            compact({
              company_name: lead.companyName.trim(),
              contact_name: lead.contactName,
              contact_email: lead.contactEmail,
              contact_phone: lead.contactPhone,
              value_cents: lead.value && lead.value.trim() !== "" ? Math.round(Number(lead.value) * 100) : undefined,
              next_step: lead.nextStep,
              next_step_on: lead.nextStepOn,
              source: lead.source,
              is_dealer: lead.isDealer,
              notes: lead.notes,
              owner_id: lead.ownerId,
            })
          )
        ),
      moveLead: (id: string, stage: string, lostReason?: string) => write(send<CrmLead>("POST", `/crm/leads/${id}/stage`, compact({ stage, lost_reason: lostReason }))),
      /** Winning a lead opens a customer account, so the directory refreshes too. */
      convertLead: (id: string, terms: { consentChannel: string; paymentTermsDays: string; creditLimit: string; registeredName: string; tin: string; address: string; autoApproveUnder: string; serviceReminders: boolean; marketing: boolean }) =>
        write(
          send<CrmLead & { customerAccount: { id: string; displayName: string } }>(
            "POST",
            `/crm/leads/${id}/convert`,
            compact({
              consent_channel: terms.consentChannel,
              payment_terms_days: terms.paymentTermsDays.trim() === "" ? undefined : Number(terms.paymentTermsDays),
              credit_limit_cents: terms.creditLimit.trim() === "" ? undefined : Math.round(Number(terms.creditLimit) * 100),
              registered_name: terms.registeredName,
              tin: terms.tin,
              address: terms.address,
              approval_overrides: terms.autoApproveUnder.trim() === "" ? undefined : { auto_approve_under_cents: Math.round(Number(terms.autoApproveUnder) * 100) },
              service_reminders: terms.serviceReminders,
              marketing: terms.marketing,
            }),
            true
          ),
          ["customer-accounts", "clients", "shop"]
        ),

      saveSettings: (settings: Partial<Record<string, number | boolean>>) => write(send<CrmSettings>("PUT", "/crm/settings", settings)),
      saveTemplate: (template: { name: string; channel: string; purpose: string; subject: string; body: string; isActive: boolean }, id?: string) =>
        write(send<MessageTemplate>(id ? "PUT" : "POST", id ? `/crm/templates/${id}` : "/crm/templates", { name: template.name.trim(), channel: template.channel, purpose: template.purpose, body: template.body, is_active: template.isActive, ...(template.subject.trim() !== "" ? { subject: template.subject.trim() } : id ? { subject: null } : {}) })),
      deleteTemplate: (id: string) => write(async () => void (await api(`/crm/templates/${id}`, { method: "DELETE" }))),
      saveRule: (kind: string, rule: { templateId: string; enabled: boolean; leadDays?: number | null }) =>
        write(send("PUT", `/crm/reminder-rules/${kind}`, compact({ template_id: rule.templateId, enabled: rule.enabled, lead_days: rule.leadDays ?? undefined }))),
      runReminders: () => write(send<{ candidates: number; queued: number; skipped: Record<string, number> }>("POST", "/crm/reminders/run")),

      saveTier: (tier: { name: string; discountPct: string; priorityBooking: boolean; perks: string; isActive: boolean }, id?: string) =>
        write(send<MembershipTier>(id ? "PUT" : "POST", id ? `/crm/tiers/${id}` : "/crm/tiers", { name: tier.name.trim(), discount_pct: tier.discountPct.trim() === "" ? "0" : tier.discountPct.trim(), priority_booking: tier.priorityBooking, is_active: tier.isActive, ...(tier.perks.trim() !== "" ? { perks: tier.perks.trim() } : id ? { perks: null } : {}) })),
      enrol: (accountId: string, tierId: string, expiresOn?: string) => write(send("POST", `/crm/customers/${accountId}/membership`, compact({ tier_id: tierId, expires_on: expiresOn }))),
      cancelMembership: (accountId: string, membershipId: string) => write(async () => void (await api(`/crm/customers/${accountId}/membership/${membershipId}`, { method: "DELETE" }))),
      adjustPoints: (accountId: string, points: number, reason: "redeemed" | "adjusted", note: string) => write(send("POST", `/crm/customers/${accountId}/points`, compact({ points, reason, note }), true)),

      savePlan: (plan: { name: string; price: string; credits: string; detailingPackageId: string; validDays: string; isActive: boolean }, id?: string) =>
        write(
          send<PrepaidPlan>(id ? "PUT" : "POST", id ? `/crm/prepaid-plans/${id}` : "/crm/prepaid-plans", {
            name: plan.name.trim(),
            price_cents: Math.round(Number(plan.price) * 100),
            credits: Number(plan.credits),
            is_active: plan.isActive,
            ...(plan.detailingPackageId !== "" ? { detailing_package_id: plan.detailingPackageId } : id ? { detailing_package_id: null } : {}),
            ...(plan.validDays.trim() !== "" ? { valid_days: Number(plan.validDays) } : id ? { valid_days: null } : {}),
          })
        ),
      /** The dialog mints `key` when it opens and reuses it on a retry, so a second click replays the sale. */
      sellPackage: (sale: { customerAccountId: string; planId: string; paymentMethod: string; paymentReference: string; branchId?: string }, key: string) =>
        write(
          async () =>
            camel<PrepaidPackage>(
              await apiData<Raw>("/crm/prepaid-packages", {
                method: "POST",
                idempotencyKey: key,
                body: compact({ customer_account_id: sale.customerAccountId, plan_id: sale.planId, payment_method: sale.paymentMethod, payment_reference: sale.paymentReference, branch_id: sale.branchId }),
              })
            ),
          BILLING_ROOTS
        ),
      redeemCredit: (packageId: string, bookingId: string, key: string) =>
        write(async () => camel<PrepaidPackage>(await apiData<Raw>(`/crm/prepaid-packages/${packageId}/redeem`, { method: "POST", idempotencyKey: key, body: { detailing_booking_id: bookingId } })), [...BILLING_ROOTS, DETAILING_ROOT]),

      saveSegment: (segment: { name: string; description: string; filters: SegmentFilters }, id?: string) =>
        write(send<CrmSegment>(id ? "PUT" : "POST", id ? `/crm/segments/${id}` : "/crm/segments", { name: segment.name.trim(), filters: segment.filters, ...(segment.description.trim() !== "" ? { description: segment.description.trim() } : id ? { description: null } : {}) })),
      deleteSegment: (id: string) => write(async () => void (await api(`/crm/segments/${id}`, { method: "DELETE" }))),
      /** Who a filter matches right now; reads only, so nothing is refreshed. */
      previewSegment: (filters: SegmentFilters) => run(async () => camel<{ data: { id: string; displayName: string }[]; meta: { total: number } }>(await api<Raw>("/crm/segments/preview", { method: "POST", body: { filters } }))),
      saveCampaign: (campaign: { name: string; segmentId: string; templateId: string; scheduledAt: string; hourlyLimit: string }, id?: string) =>
        write(
          send<CrmCampaign>(id ? "PUT" : "POST", id ? `/crm/campaigns/${id}` : "/crm/campaigns", {
            name: campaign.name.trim(),
            segment_id: campaign.segmentId,
            template_id: campaign.templateId,
            ...(campaign.scheduledAt !== "" ? { scheduled_at: new Date(campaign.scheduledAt).toISOString() } : id ? { scheduled_at: null } : {}),
            ...(campaign.hourlyLimit.trim() !== "" ? { hourly_limit: Number(campaign.hourlyLimit) } : id ? { hourly_limit: null } : {}),
          })
        ),
      setCampaignStatus: (id: string, status: "scheduled" | "draft" | "cancelled") => write(send<CrmCampaign & { progress: CampaignProgress }>("POST", `/crm/campaigns/${id}/status`, { status })),
    }),
    [write, send]
  );
}
