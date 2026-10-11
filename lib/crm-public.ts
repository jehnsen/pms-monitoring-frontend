"use client";

import { apiData } from "@/lib/api/client";
import { camel } from "@/lib/api/crm";
import type { FeedbackLink, ReminderLink, UnsubscribeLink } from "@/types/crm";

/**
 * What the links inside a CRM message open. No sign-in: the token in the URL
 * is the credential, so none of the session-keyed hooks of `lib/crm.ts`.
 */

type Raw = Record<string, unknown>;
const at = (kind: string, token: string) => `/public/crm/${kind}/${encodeURIComponent(token)}`;

export const fetchReminderLink = async (token: string) => camel<ReminderLink>(await apiData<Raw>(at("reminders", token)));

export const requestBookingFromReminder = async (token: string, preferredDate: string, note: string) =>
  camel<ReminderLink>(await apiData<Raw>(`${at("reminders", token)}/book`, { method: "POST", body: { ...(preferredDate ? { preferred_date: preferredDate } : {}), ...(note.trim() ? { note: note.trim() } : {}) } }));

export const fetchFeedbackLink = async (token: string) => camel<FeedbackLink>(await apiData<Raw>(at("feedback", token)));

export const answerFeedback = async (token: string, score: number, comment: string) =>
  camel<FeedbackLink>(await apiData<Raw>(at("feedback", token), { method: "POST", body: { score, ...(comment.trim() ? { comment: comment.trim() } : {}) } }));

export const fetchUnsubscribeLink = async (token: string) => camel<UnsubscribeLink>(await apiData<Raw>(at("unsubscribe", token)));

export const confirmUnsubscribe = async (token: string) => camel<UnsubscribeLink>(await apiData<Raw>(at("unsubscribe", token), { method: "POST" }));
