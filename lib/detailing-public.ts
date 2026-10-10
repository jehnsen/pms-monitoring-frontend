"use client";

import { API_URL, apiData } from "@/lib/api/client";
import { toAvailability, toBrand, toConfirmation, toMonitor, toPublicPage, toRealtime } from "@/lib/api/detailing";
import { toApiError } from "@/lib/api/errors";
import type { Availability, BranchBrand, MonitorView, PublicConfirmation, PublicPage, RealtimeConfig, SizeClass } from "@/types/detailing";

/**
 * The two doors into detailing that need no sign-in: a branch's public
 * booking page and the shop monitor on a wall screen. Neither uses the
 * session-keyed hooks of `lib/detailing.ts`.
 */

type Raw = Record<string, any>;

export async function fetchPublicPage(slug: string): Promise<PublicPage> {
  return toPublicPage(await apiData<Raw>(`/public/detailing/${encodeURIComponent(slug)}`));
}

export async function fetchPublicAvailability(slug: string, packageId: string, sizeClass: SizeClass, date: string): Promise<Availability> {
  return toAvailability(await apiData<Raw>(`/public/detailing/${encodeURIComponent(slug)}/availability`, { query: { package_id: packageId, size_class: sizeClass, date } }));
}

export interface PublicBookingDraft {
  packageId: string;
  sizeClass: SizeClass;
  date: string;
  startTime: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear?: number;
  plateNumber?: string;
  notes?: string;
  consent: boolean;
  captchaToken?: string;
}

/** An empty optional string is left out, not sent. */
export async function requestPublicBooking(slug: string, draft: PublicBookingDraft): Promise<{ token: string; booking: PublicConfirmation }> {
  const body = await apiData<Raw>(`/public/detailing/${encodeURIComponent(slug)}/bookings`, {
    method: "POST",
    body: {
      package_id: draft.packageId,
      size_class: draft.sizeClass,
      date: draft.date,
      start_time: draft.startTime,
      first_name: draft.firstName.trim(),
      last_name: draft.lastName.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      vehicle_make: draft.vehicleMake.trim(),
      vehicle_model: draft.vehicleModel.trim(),
      consent_service_records: draft.consent,
      ...(draft.vehicleYear ? { vehicle_year: draft.vehicleYear } : {}),
      ...(draft.plateNumber?.trim() ? { plate_number: draft.plateNumber.trim() } : {}),
      ...(draft.notes?.trim() ? { notes: draft.notes.trim() } : {}),
      ...(draft.captchaToken ? { captcha_token: draft.captchaToken } : {}),
    },
  });
  return { token: body.token, booking: toConfirmation(body.booking) };
}

export async function fetchPublicConfirmation(token: string): Promise<{ branch: BranchBrand; booking: PublicConfirmation }> {
  const body = await apiData<Raw>(`/public/detailing/bookings/${encodeURIComponent(token)}`);
  return { branch: toBrand(body.branch), booking: toConfirmation(body.booking) };
}

/* ---------------------------------------------------------- wall screen */

export interface DisplayView {
  branch: BranchBrand;
  displayName: string;
  monitor: MonitorView;
  realtime: RealtimeConfig;
}

/** A display has no session: its token is the credential, sent as a header and never as a cookie. */
async function displayRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "omit",
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Display-Token": token, ...(init.headers ?? {}) },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw toApiError(response.status, body, response.headers.get("X-Request-Id"));
  return body as T;
}

export async function fetchDisplay(token: string): Promise<DisplayView> {
  const { data } = await displayRequest<{ data: Raw }>("/display/detailing/monitor", token);
  return { branch: toBrand(data.branch), displayName: data.display.name, monitor: toMonitor(data.monitor), realtime: toRealtime(data.realtime) };
}

export function authorizeDisplaySocket(token: string, socketId: string, channelName: string): Promise<{ auth: string }> {
  return displayRequest<{ auth: string }>("/display/broadcasting/auth", token, { method: "POST", body: JSON.stringify({ socket_id: socketId, channel_name: channelName }) });
}
