import { describe, expect, it } from "vitest";
import { localSupabaseIsUp, signInAs } from "./supabase-test-client";

/**
 * `pms_work_order_events` and `pms_approval_log` are granted SELECT + INSERT
 * only (see `lib/rls-parity.test.ts`'s static check on the migration text).
 * This proves Postgres actually refuses UPDATE/DELETE against a live
 * database, not just that the grant line is present in the SQL file.
 */

// `describe.skipIf` reads this synchronously at collection time, so the
// readiness check has to resolve before that.
const dbUp = await localSupabaseIsUp();

describe.skipIf(!dbUp)("append-only tables reject UPDATE and DELETE", () => {
  it("pms_work_order_events refuses an UPDATE", async () => {
    const client = await signInAs("owner@mekanikomore.ph");

    const { data: rows } = await client.from("pms_work_order_events").select("id").limit(1);
    expect(rows!.length).toBeGreaterThan(0);

    const { error, data } = await client
      .from("pms_work_order_events")
      .update({ actor: "tampered" })
      .eq("id", rows![0].id)
      .select();

    // No update policy exists, so PostgREST either errors (no grant) or the
    // RLS-filtered update matches and changes zero rows — both are "refused".
    if (!error) expect(data).toEqual([]);

    await client.auth.signOut();
  });

  it("pms_work_order_events refuses a DELETE", async () => {
    const client = await signInAs("owner@mekanikomore.ph");

    const { data: rows } = await client.from("pms_work_order_events").select("id").limit(1);
    const before = rows![0].id;

    const { error, data } = await client
      .from("pms_work_order_events")
      .delete()
      .eq("id", before)
      .select();

    if (!error) expect(data).toEqual([]);

    const { data: stillThere } = await client
      .from("pms_work_order_events")
      .select("id")
      .eq("id", before);
    expect(stillThere).toEqual([{ id: before }]);

    await client.auth.signOut();
  });

  it("pms_approval_log refuses an UPDATE", async () => {
    const client = await signInAs("owner@mekanikomore.ph");

    const { data: rows } = await client.from("pms_approval_log").select("id").limit(1);
    if (!rows || rows.length === 0) {
      await client.auth.signOut();
      return;
    }

    const { error, data } = await client
      .from("pms_approval_log")
      .update({ note: "tampered" })
      .eq("id", rows[0].id)
      .select();

    if (!error) expect(data).toEqual([]);

    await client.auth.signOut();
  });

  it("pms_approval_log refuses a DELETE", async () => {
    const client = await signInAs("owner@mekanikomore.ph");

    const { data: rows } = await client.from("pms_approval_log").select("id").limit(1);
    if (!rows || rows.length === 0) {
      await client.auth.signOut();
      return;
    }
    const before = rows[0].id;

    const { error, data } = await client.from("pms_approval_log").delete().eq("id", before).select();
    if (!error) expect(data).toEqual([]);

    const { data: stillThere } = await client.from("pms_approval_log").select("id").eq("id", before);
    expect(stillThere).toEqual([{ id: before }]);

    await client.auth.signOut();
  });
});
