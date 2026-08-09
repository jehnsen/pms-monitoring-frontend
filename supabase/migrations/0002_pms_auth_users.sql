-- =====================================================================
-- MekanikoMoR — demo accounts as real Supabase Auth users
--
-- These replace lib/auth.ts's DEMO_ACCOUNTS. They must be real auth.users
-- rows, because RLS keys off auth.uid(): a session the browser invents cannot
-- be trusted by the database, so tenant isolation is only a real security
-- control once these exist.
--
-- Every account uses the password `demo1234`, matching the previous demo.
-- CHANGE THESE before this instance is exposed to anyone real — see the note
-- at the bottom of this file.
--
-- Idempotent: an account that already exists has its profile re-pointed rather
-- than being duplicated. Existing users of the shared detailing app are not
-- touched — only the eleven emails listed here.
-- =====================================================================

do $$
declare
  account   record;
  user_uuid uuid;
  -- bcrypt via pgcrypto, which Supabase projects have installed.
  hashed    text := crypt('demo1234', gen_salt('bf'));
begin
  for account in
    select * from (values
      -- email, name, role, title, provider_id, fleet_client_id
      -- ------------------------------------------------ provider side
      ('owner@mekanikomore.ph',    'Mike Manabat',      'provider_admin',      'Owner / Provider Admin',  'prov-mekanikomore', null),
      ('advisor@mekanikomore.ph',  'Divina Lacson',     'service_advisor',     'Service Advisor',         'prov-mekanikomore', null),
      ('bay@mekanikomore.ph',      'Arnel Pascual',     'provider_technician', 'Provider Technician',     'prov-mekanikomore', null),
      -- ------------------------------------------- client side · Actimed
      ('fleet@actimed.ph',         'Elena Rosales',     'fleet_manager',       'Fleet Manager',           'prov-mekanikomore', 'fc-actimed'),
      ('ops@mekanikomore.ph',      'Marisol Bautista',  'operations',          'Operations Supervisor',   'prov-mekanikomore', 'fc-actimed'),
      ('tech@mekanikomore.ph',     'Arnel Pascual',     'technician',          'Lead Technician',         'prov-mekanikomore', 'fc-actimed'),
      ('purchasing@mekanikomor.ph','Grace Villanueva',  'purchasing_officer',  'Purchasing Officer',      'prov-mekanikomore', 'fc-actimed'),
      ('viewer@mekanikomore.ph',   'Camille Ortega',    'viewer',              'Authorised Viewer',       'prov-mekanikomore', 'fc-actimed'),
      -- ------------------------------ client side · the other fleet clients
      -- One account each, so isolation can be seen rather than asserted.
      ('fleet@northwind.ph',       'Ruben Salcedo',     'fleet_manager',       'Fleet Manager',           'prov-mekanikomore', 'fc-northwind'),
      ('operations@sagrada.ph',    'Imelda Cortez',     'fleet_manager',       'Operations Director',     'prov-mekanikomore', 'fc-sagrada'),
      -- Bayani is seeded `suspended`, so this account resolves to no scope at
      -- all — the fail-closed path stays demonstrable against the real
      -- database, now enforced by RLS rather than by the client.
      ('yard@bayanicon.ph',        'Andres Malolos',    'fleet_manager',       'Yard Manager (suspended account)', 'prov-mekanikomore', 'fc-bayani')
    ) as t(email, name, role, title, provider_id, fleet_client_id)
  loop
    select id into user_uuid from auth.users where email = account.email;

    if user_uuid is null then
      user_uuid := gen_random_uuid();

      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        confirmation_token, recovery_token,
        email_change_token_new, email_change
      ) values (
        user_uuid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        account.email,
        hashed,
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('name', account.name),
        '', '', '', ''
      );

      -- GoTrue requires a matching identity row for email sign-in to work.
      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(),
        user_uuid,
        user_uuid::text,
        jsonb_build_object('sub', user_uuid::text, 'email', account.email, 'email_verified', true),
        'email',
        now(), now(), now()
      );
    end if;

    -- The tenancy bridge. Upserted so re-running repairs a profile whose
    -- client or role has drifted, without touching the auth user.
    insert into pms_profiles (id, email, name, role, title, provider_id, fleet_client_id)
    values (
      user_uuid, account.email, account.name, account.role::pms_user_role,
      account.title, account.provider_id, account.fleet_client_id
    )
    on conflict (id) do update set
      email           = excluded.email,
      name            = excluded.name,
      role            = excluded.role,
      title           = excluded.title,
      provider_id     = excluded.provider_id,
      fleet_client_id = excluded.fleet_client_id;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- SECURITY NOTE
--
-- Every account above shares the password `demo1234`, carried over from the
-- pre-database demo. That is appropriate for a demo instance and NOT for
-- anything reachable by the public: these are now real credentials against a
-- real database, where they previously only unlocked a localStorage blob.
--
-- Before exposing this instance, either rotate each password in the Supabase
-- dashboard (Authentication -> Users) or delete the accounts that are not
-- needed. Note also that this database is shared with another application, so
-- these users exist in the same auth pool as that app's users.
-- ---------------------------------------------------------------------
