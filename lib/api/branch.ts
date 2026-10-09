"use client";

import { useSyncExternalStore } from "react";

/**
 * The staff branch switcher's selection, sent as `X-Branch-Id` on every
 * request. One allowed branch id, or `"all"` (every branch the user may
 * work in). Persisted per user, so a shared counter PC doesn't carry one
 * person's branch into another's session. Portal sessions never send it.
 *
 * Kept outside React so the fetch wrapper can read it synchronously.
 */

export const ALL_BRANCHES = "all";

let userId: string | null = null;
let selected: string | null = null;
const listeners = new Set<() => void>();

function storageKey(id: string) {
  return `torquelane.branch.${id}`;
}

function emit() {
  for (const listener of listeners) listener();
}

/** Called when the session resolves; loads that user's saved branch. */
export function bindBranchToUser(id: string | null, allowed: string[]) {
  userId = id;
  if (id === null) {
    selected = null;
    emit();
    return;
  }
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(storageKey(id));
  } catch {
    saved = null;
  }
  // A pin the user lost since last time falls back to "all".
  selected = saved === ALL_BRANCHES || (saved !== null && allowed.includes(saved)) ? saved : null;
  emit();
}

export function setSelectedBranch(branchId: string | null) {
  selected = branchId;
  if (userId !== null) {
    try {
      if (branchId === null) window.localStorage.removeItem(storageKey(userId));
      else window.localStorage.setItem(storageKey(userId), branchId);
    } catch {
      // Storage blocked: the selection still holds for this tab.
    }
  }
  emit();
}

/** The header value to send, or null to send none. */
export function selectedBranchHeader(): string | null {
  return selected;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSelectedBranch(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => selected,
    () => null
  );
}
