"use server";

import "@/server/runtime";
import { pgDb } from "@/server/db";
import { getVerifiedUser } from "@/server/supabase-server";
import * as commands from "@/server/commands/work-orders";
import type { CommandDeps } from "@/server/commands/context";

/**
 * The browser's entry points to the work-order commands.
 *
 * Each action does exactly two things: resolve the caller from the request's
 * cookie session (verified against GoTrue, never decoded locally), and hand
 * the untrusted input to the command with the real database. Everything else
 * — scope, capability, validation, the transaction — happens in the command.
 *
 * Only these thin wrappers are exported from a "use server" module. The
 * command functions take a `user` argument, and exporting them here would let
 * a browser call them with any user it liked.
 */

const deps: CommandDeps = { db: pgDb };

export async function createWorkOrderAction(input: unknown) {
  return commands.createWorkOrder(deps, await getVerifiedUser(), input);
}

export async function updateDraftAction(input: unknown) {
  return commands.updateDraft(deps, await getVerifiedUser(), input);
}

export async function recordLinesAction(input: unknown) {
  return commands.recordLines(deps, await getVerifiedUser(), input);
}

export async function sendForApprovalAction(input: unknown) {
  return commands.sendForApproval(deps, await getVerifiedUser(), input);
}

export async function decideLinesAction(input: unknown) {
  return commands.decideLines(deps, await getVerifiedUser(), input);
}

export async function scheduleAction(input: unknown) {
  return commands.schedule(deps, await getVerifiedUser(), input);
}

export async function startAction(input: unknown) {
  return commands.start(deps, await getVerifiedUser(), input);
}

export async function completeAction(input: unknown) {
  return commands.complete(deps, await getVerifiedUser(), input);
}

export async function closeAction(input: unknown) {
  return commands.close(deps, await getVerifiedUser(), input);
}

export async function markCollectedAction(input: unknown) {
  return commands.markCollected(deps, await getVerifiedUser(), input);
}

export async function cancelAction(input: unknown) {
  return commands.cancel(deps, await getVerifiedUser(), input);
}
