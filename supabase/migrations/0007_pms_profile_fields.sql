-- =====================================================================
-- MekanikoMoR — profile self-service: first/last name and username
--
-- pms_profiles carried only a single `name` field. The new "My profile"
-- page lets a signed-in user edit first name, last name, and username
-- independently, so those become real columns; `name` is kept as the
-- derived "first last" string every existing consumer (Topbar, Avatar,
-- Access page, alerts) already reads, so nothing else in the app has to
-- change. RLS already lets a user update their own row
-- (pms_profiles_update_self, 0001) — it pins role/provider_id/
-- fleet_client_id, not the columns added here, so no policy change is
-- needed.
-- =====================================================================

alter table pms_profiles
  add column if not exists first_name text not null default '',
  add column if not exists last_name  text not null default '',
  add column if not exists username   text;

-- Backfill from the existing `name` column: everything before the first
-- space is the first name, the rest is the last name (empty if `name` was
-- only one word).
update pms_profiles
set
  first_name = split_part(name, ' ', 1),
  last_name  = trim(substring(name from length(split_part(name, ' ', 1)) + 1))
where first_name = '' and last_name = '';

-- Backfilled from the email's local part rather than `name` — two demo
-- accounts share the display name "Arnel Pascual", which would collide
-- under the uniqueness constraint below. A numeric suffix breaks ties
-- among rows that also share a local part (e.g. fleet@actimed.ph and
-- fleet@northwind.ph both start with "fleet").
with ranked as (
  select
    id,
    split_part(email, '@', 1) as base,
    row_number() over (partition by split_part(email, '@', 1) order by email) as rn
  from pms_profiles
  where username is null
)
update pms_profiles p
set username = ranked.base || case when ranked.rn = 1 then '' else ranked.rn::text end
from ranked
where p.id = ranked.id;

alter table pms_profiles
  alter column username set not null,
  add constraint pms_profiles_username_unique unique (username);
