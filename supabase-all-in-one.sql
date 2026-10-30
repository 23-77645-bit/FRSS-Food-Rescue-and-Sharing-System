-- ================================================================
-- FRSS SUPABASE ALL-IN-ONE SCHEMA / MIGRATION
-- ================================================================
-- Purpose: Paste this ONE file into the Supabase SQL Editor.
--
-- Consolidated from the FRSS SQL migrations:
--   supabase-schema.sql
--   supabase-fix.sql
--   supabase-location.sql
--   supabase-expiration.sql
--   supabase-reservation-step1.sql + supabase-reservation-step2.sql
--   supabase-details-reports.sql
--   supabase-food-images.sql + supabase-food-images-3.sql
--   supabase-claim-approval-notifications.sql
--   supabase-admin-complete.sql
--   supabase-enhancements.sql
--
-- Notes:
-- 1) reservation-step1 is folded into the initial food_post_status enum by
--    including 'reserved' from the beginning. This avoids requiring a second
--    paste/commit between ALTER TYPE and the reservation functions.
-- 2) reservation.sql and reservation-step2.sql are identical; only step2 is
--    included once.
-- 3) food-images-3.sql is redundant on a fresh install because image_url and
--    image_urls are already created by the base schema/image migration. Its
--    compatibility backfill is retained below.
-- 4) supabase-enhancements.sql.bak is intentionally NOT included.
-- 5) This script is designed for a fresh FRSS database and for re-running
--    idempotent migrations on an existing FRSS database. If an existing
--    database was created with the old enum WITHOUT 'reserved', run the
--    reservation enum change separately before this full script.
-- ================================================================


-- ================================================================
-- SECTION 1: supabase-schema.sql
-- ================================================================

-- Food Rescue and Sharing System (FRSS)
-- Supabase / PostgreSQL schema
-- Based on the FRSS Business Requirements Document, Version 1.0 (Sept. 5, 2026).
-- Run this file in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- ============================================================
-- ENUM TYPES
-- ============================================================

do $$ begin
  create type public.user_role as enum ('user', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.food_post_status as enum ('draft', 'available', 'reserved', 'claimed', 'picked_up', 'completed', 'cancelled', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.claim_status as enum ('pending', 'confirmed', 'ready_for_pickup', 'picked_up', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

-- ============================================================
-- PROFILES
-- One row per authenticated Supabase user.
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  role public.user_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Human-readable profile ID. The database stores the sequential number;
-- the UI displays it as a fixed 6-digit value (000001, 000002, ...).
create sequence if not exists public.profile_number_seq start with 1;

alter table public.profiles
  add column if not exists profile_number bigint;

-- Backfill existing profiles in creation order without changing their UUID ids.
with numbered as (
  select id, nextval('public.profile_number_seq') as profile_number
  from public.profiles
  where profile_number is null
  order by created_at, id
)
update public.profiles p
set profile_number = numbered.profile_number
from numbered
where p.id = numbered.id;

select setval(
  'public.profile_number_seq',
  greatest(1, coalesce((select max(profile_number) from public.profiles), 0),
    (select last_value from public.profile_number_seq)),
  (select is_called from public.profile_number_seq) or exists(select 1 from public.profiles)
);

alter table public.profiles
  alter column profile_number set default nextval('public.profile_number_seq'),
  alter column profile_number set not null;

create unique index if not exists profiles_profile_number_key
  on public.profiles(profile_number);

-- ============================================================
-- CATEGORIES
-- ============================================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- FOOD POSTS
-- Quantity is stored as numeric so units such as kg, liters, packs,
-- servings, etc. can be represented.
-- ============================================================
create table if not exists public.food_posts (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references public.profiles(id) on delete restrict,
  category_id uuid references public.categories(id) on delete set null,
  food_name text not null,
  description text,
  quantity numeric(12,2) not null check (quantity > 0),
  remaining_quantity numeric(12,2) not null check (remaining_quantity >= 0),
  unit text not null,
  expiration_at timestamptz not null,
  pickup_location text not null,
  pickup_instructions text,
  status public.food_post_status not null default 'draft',
  published_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_post_remaining_lte_quantity check (remaining_quantity <= quantity)
);

-- ============================================================
-- CLAIMS
-- One claim represents a user's claim for a quantity from a food post.
-- ============================================================
create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  food_post_id uuid not null references public.food_posts(id) on delete restrict,
  claimant_id uuid not null references public.profiles(id) on delete restrict,
  quantity numeric(12,2) not null check (quantity > 0),
  status public.claim_status not null default 'pending',
  claimed_at timestamptz not null default now(),
  confirmed_at timestamptz,
  ready_at timestamptz,
  picked_up_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- AUDIT LOG
-- Records important status/action changes for traceability.
-- ============================================================
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_food_posts_donor_id on public.food_posts(donor_id);
create index if not exists idx_food_posts_category_id on public.food_posts(category_id);
create index if not exists idx_food_posts_status on public.food_posts(status);
create index if not exists idx_food_posts_expiration_at on public.food_posts(expiration_at);
create index if not exists idx_claims_food_post_id on public.claims(food_post_id);
create index if not exists idx_claims_claimant_id on public.claims(claimant_id);
create index if not exists idx_claims_status on public.claims(status);
create index if not exists idx_audit_logs_actor_id on public.audit_logs(actor_id);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories
for each row execute function public.set_updated_at();

drop trigger if exists food_posts_set_updated_at on public.food_posts;
create trigger food_posts_set_updated_at before update on public.food_posts
for each row execute function public.set_updated_at();

drop trigger if exists claims_set_updated_at on public.claims;
create trigger claims_set_updated_at before update on public.claims
for each row execute function public.set_updated_at();

-- ============================================================
-- PROFILE CREATION FROM SUPABASE AUTH
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============================================================
-- HELPER: ADMIN CHECK
-- Security-definer avoids recursive RLS checks when policies inspect role.
-- ============================================================

create or replace function public.has_claim_for_food_post(p_food_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.claims
    where food_post_id = p_food_post_id and claimant_id = auth.uid()
  );
$$;

revoke all on function public.has_claim_for_food_post(uuid) from public;
grant execute on function public.has_claim_for_food_post(uuid) to anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================
-- BUSINESS FUNCTION: CLAIM FOOD
-- Atomically checks:
-- 1) authenticated user
-- 2) food is available
-- 3) user is not claiming their own post
-- 4) quantity does not exceed remaining quantity
-- 5) expiration has not passed
-- 6) remaining quantity is decremented
-- ============================================================
create or replace function public.claim_food(
  p_food_post_id uuid,
  p_quantity numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_food public.food_posts%rowtype;
  v_claim_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Claim quantity must be greater than zero';
  end if;

  select * into v_food
  from public.food_posts
  where id = p_food_post_id
  for update;

  if not found then
    raise exception 'Food post not found';
  end if;

  if v_food.donor_id = auth.uid() then
    raise exception 'You cannot claim your own food post';
  end if;

  if v_food.status <> 'available' then
    raise exception 'Food post is not available';
  end if;

  if v_food.expiration_at <= now() then
    update public.food_posts
    set status = 'expired'
    where id = v_food.id;
    raise exception 'Food post has expired';
  end if;

  if p_quantity > v_food.remaining_quantity then
    raise exception 'Claim quantity exceeds remaining available quantity';
  end if;

  insert into public.claims (food_post_id, claimant_id, quantity, status)
  values (v_food.id, auth.uid(), p_quantity, 'pending')
  returning id into v_claim_id;

  update public.food_posts
  set remaining_quantity = remaining_quantity - p_quantity,
      status = case
        when remaining_quantity - p_quantity = 0 then 'claimed'::public.food_post_status
        else 'available'::public.food_post_status
      end
  where id = v_food.id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'claim_created', 'claim', v_claim_id,
    jsonb_build_object('food_post_id', v_food.id, 'quantity', p_quantity)
  );

  return v_claim_id;
end;
$$;

revoke all on function public.claim_food(uuid, numeric) from public;
grant execute on function public.claim_food(uuid, numeric) to authenticated;

-- ============================================================
-- STATUS HELPERS
-- Donor can update the pickup lifecycle for their own food post.
-- Admin can manage system monitoring.
-- ============================================================
create or replace function public.update_claim_status(
  p_claim_id uuid,
  p_status public.claim_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.claims%rowtype;
  v_post public.food_posts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select c.* into v_claim
  from public.claims c
  where c.id = p_claim_id
  for update;

  if not found then
    raise exception 'Claim not found';
  end if;

  select fp.* into v_post
  from public.food_posts fp
  where fp.id = v_claim.food_post_id;

  if not (v_post.donor_id = auth.uid() or public.is_admin() or v_claim.claimant_id = auth.uid()) then
    raise exception 'Not authorized to update this claim';
  end if;

  update public.claims
  set status = p_status,
      confirmed_at = case when p_status = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
      ready_at = case when p_status = 'ready_for_pickup' then coalesce(ready_at, now()) else ready_at end,
      picked_up_at = case when p_status = 'picked_up' then coalesce(picked_up_at, now()) else picked_up_at end,
      completed_at = case when p_status = 'completed' then coalesce(completed_at, now()) else completed_at end,
      cancelled_at = case when p_status = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end
  where id = p_claim_id;

  if p_status = 'completed' then
    update public.food_posts
    set status = case when remaining_quantity = 0 then 'completed' else status end,
        completed_at = case when remaining_quantity = 0 then coalesce(completed_at, now()) else completed_at end
    where id = v_post.id;
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'claim_status_updated', 'claim', p_claim_id,
    jsonb_build_object('status', p_status::text)
  );
end;
$$;

revoke all on function public.update_claim_status(uuid, public.claim_status) from public;
grant execute on function public.update_claim_status(uuid, public.claim_status) to authenticated;

-- ============================================================
-- AUTOMATIC EXPIRATION VIEW
-- Use this view for available food listings so expired food is excluded.
-- ============================================================
create or replace view public.available_food_posts
with (security_invoker = true)
as
select fp.*
from public.food_posts fp
where fp.status = 'available'
  and fp.remaining_quantity > 0
  and fp.expiration_at > now();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.food_posts enable row level security;
alter table public.claims enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles
 drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists profiles_admin_manage on public.profiles;
create policy profiles_admin_manage on public.profiles
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Categories: everyone authenticated can read active categories; admins manage.
drop policy if exists categories_select_active on public.categories;
create policy categories_select_active on public.categories
for select to anon, authenticated
using (is_active = true or public.is_admin());

drop policy if exists categories_admin_manage on public.categories;
create policy categories_admin_manage on public.categories
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Food posts: authenticated users can browse available posts, own posts, and admins.
drop policy if exists food_posts_select on public.food_posts;
create policy food_posts_select on public.food_posts
for select to anon, authenticated
using (
  status = 'available'
  or donor_id = auth.uid()
  or public.has_claim_for_food_post(food_posts.id)
  or public.is_admin()
);

drop policy if exists food_posts_insert_own on public.food_posts;
create policy food_posts_insert_own on public.food_posts
for insert to authenticated
with check (donor_id = auth.uid());

drop policy if exists food_posts_update_own_or_admin on public.food_posts;
create policy food_posts_update_own_or_admin on public.food_posts
for update to authenticated
using (donor_id = auth.uid() or public.is_admin())
with check (donor_id = auth.uid() or public.is_admin());

drop policy if exists food_posts_delete_own_or_admin on public.food_posts;
create policy food_posts_delete_own_or_admin on public.food_posts
for delete to authenticated
using (donor_id = auth.uid() or public.is_admin());

-- Claims: claimant, donor of the food post, or admin can view.
drop policy if exists claims_select_participants_or_admin on public.claims;
create policy claims_select_participants_or_admin on public.claims
for select to authenticated
using (
  claimant_id = auth.uid()
  or exists (
    select 1 from public.food_posts fp
    where fp.id = claims.food_post_id and fp.donor_id = auth.uid()
  )
  or public.is_admin()
);

-- Direct claim inserts are intentionally not permitted; use claim_food().
drop policy if exists claims_insert_none on public.claims;
create policy claims_insert_none on public.claims
for insert to authenticated
with check (false);

-- Claims may only be changed through update_claim_status().
drop policy if exists claims_update_none on public.claims;
create policy claims_update_none on public.claims
for update to authenticated
using (false)
with check (false);

-- Audit logs: admins can view all; users can view their own actions.
drop policy if exists audit_logs_select_own_or_admin on public.audit_logs;
create policy audit_logs_select_own_or_admin on public.audit_logs
for select to authenticated
using (actor_id = auth.uid() or public.is_admin());

-- Inserts happen through server-side functions/triggers; no client insert policy.
drop policy if exists audit_logs_insert_none on public.audit_logs;
create policy audit_logs_insert_none on public.audit_logs
for insert to authenticated
with check (false);

-- ============================================================
-- SEED CATEGORIES
-- ============================================================
insert into public.categories (name, description)
values
  ('Cooked Meals', 'Prepared meals that are still safe to consume.'),
  ('Bakery', 'Bread, pastries, and other baked goods.'),
  ('Fruits', 'Fresh fruits.'),
  ('Vegetables', 'Fresh vegetables.'),
  ('Canned Goods', 'Sealed canned food products.'),
  ('Packaged Food', 'Sealed packaged food products.'),
  ('Other', 'Other eligible food items.')
on conflict (name) do nothing;

-- ============================================================
-- OPTIONAL: MAKE AN ADMIN
-- ============================================================
-- After registering an account, run this manually with the user's auth UUID:
-- update public.profiles set role = 'admin' where id = 'YOUR-AUTH-USER-UUID';

-- ============================================================
-- NOTES
-- ============================================================
-- 1. BR-01/BRU-01: Supabase Auth handles email/password authentication;
--    the profile trigger creates the application profile after registration.
-- 2. BR-15/BRU-04: claim_food() blocks claiming one's own post.
-- 3. BR-16/BRU-05: claim_food() blocks claims above remaining quantity.
-- 4. BRU-06: claim_food() decrements remaining_quantity atomically.
-- 5. BRU-07: a post reaches 'claimed' when remaining quantity becomes zero.
-- 6. BRU-08: claim_food() rejects expired food; available_food_posts also excludes it.
-- 7. BRU-09: update_claim_status() permits donor/admin/claim participant according to
--    the workflow. The donor remains the owner of the food post and can update its
--    pickup lifecycle through the RPC.
-- 8. BRU-10 / NFR-08: audit_logs and retained claims/food posts provide traceability.

-- ============================================================
-- FOOD PHOTOS
-- Stores the public URL of the donor-uploaded food photo.
-- Run this migration on an existing database before using photo uploads.
-- ============================================================
alter table public.food_posts add column if not exists image_url text;
alter table public.food_posts add column if not exists image_urls jsonb not null default '[]'::jsonb;

-- ================================================================
-- SECTION 2: supabase-fix.sql
-- ================================================================

-- FRSS one-time fixes for an already initialized Supabase database.
-- Run this AFTER supabase-schema.sql. It does not recreate or delete data.

-- Public visitors should be able to browse currently available food.

create or replace function public.has_claim_for_food_post(p_food_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.claims
    where food_post_id = p_food_post_id and claimant_id = auth.uid()
  );
$$;

revoke all on function public.has_claim_for_food_post(uuid) from public;
grant execute on function public.has_claim_for_food_post(uuid) to anon, authenticated;

-- Claiming still requires authentication and is enforced by claim_food().
drop policy if exists categories_select_active on public.categories;
create policy categories_select_active on public.categories
for select to anon, authenticated
using (is_active = true or public.is_admin());

drop policy if exists food_posts_select on public.food_posts;
create policy food_posts_select on public.food_posts
for select to anon, authenticated
using (
  status = 'available'
  or donor_id = auth.uid()
  or public.has_claim_for_food_post(food_posts.id)
  or public.is_admin()
);

-- Keep the original schema's policies correct for future fresh installs too.

-- ================================================================
-- SECTION 3: supabase-location.sql
-- ================================================================

-- FRSS location migration
-- Run once after the original schema and supabase-fix.sql.

alter table public.food_posts
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6);

alter table public.food_posts
  drop constraint if exists food_posts_latitude_range,
  drop constraint if exists food_posts_longitude_range;

alter table public.food_posts
  add constraint food_posts_latitude_range check (latitude is null or (latitude >= -90 and latitude <= 90)),
  add constraint food_posts_longitude_range check (longitude is null or (longitude >= -180 and longitude <= 180));

create index if not exists food_posts_location_idx
  on public.food_posts (latitude, longitude)
  where latitude is not null and longitude is not null;

-- ================================================================
-- SECTION 4: supabase-expiration.sql
-- ================================================================

-- FRSS expiration migration
-- Run once after supabase-schema.sql / supabase-fix.sql.
-- Expired food remains in the database for audit/history, but is never shown
-- as available. This function marks time-expired posts as expired so donors
-- and administrators can see the expired status.

create or replace function public.expire_food_posts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.food_posts
  set status = 'expired'::public.food_post_status,
      updated_at = now()
  where expiration_at <= now()
    and status in ('draft'::public.food_post_status, 'available'::public.food_post_status, 'claimed'::public.food_post_status, 'picked_up'::public.food_post_status);

  get diagnostics v_count = row_count;

  if v_count > 0 then
    insert into public.audit_logs(actor_id, action, entity_type, details)
    values (
      auth.uid(),
      'food_posts_expired',
      'food_post',
      jsonb_build_object('count', v_count, 'expired_at', now())
    );
  end if;

  return v_count;
end;
$$;

revoke all on function public.expire_food_posts() from public;
grant execute on function public.expire_food_posts() to authenticated;

-- Keep the public availability view defensive even if a post has not yet been
-- marked expired by the dashboard/app.
create or replace view public.available_food_posts
with (security_invoker = true)
as
select fp.*
from public.food_posts fp
where fp.status = 'available'
  and fp.remaining_quantity > 0
  and fp.expiration_at > now();

-- ================================================================
-- SECTION 5: supabase-reservation-step2.sql
-- ================================================================

-- FRSS reservation / claim safety migration
-- Run once after supabase-schema.sql, supabase-fix.sql,
-- supabase-location.sql and supabase-expiration.sql.
--
-- A claim creates a temporary reservation so other users can immediately see
-- that someone else is already claiming the food. The database, not the
-- browser, is the source of truth and serializes competing claims.

ALTER TABLE public.food_posts
  ADD COLUMN IF NOT EXISTS reserved_by uuid references public.profiles(id) on delete set null,
  ADD COLUMN IF NOT EXISTS reservation_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_food_posts_reservation_expires_at
  ON public.food_posts(reservation_expires_at);

-- Make reserved posts visible to the public listing, but do not expose who
-- reserved them. Claimant/donor/admin can still see their own related data.
DROP POLICY IF EXISTS food_posts_select ON public.food_posts;
CREATE POLICY food_posts_select ON public.food_posts
FOR SELECT TO anon, authenticated
USING (
  (status IN ('available','reserved') AND expiration_at > now() AND remaining_quantity > 0)
  OR donor_id = auth.uid()
  OR public.has_claim_for_food_post(food_posts.id)
  OR public.is_admin()
);

-- ------------------------------------------------------------
-- Release reservations whose hold window elapsed.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_post public.food_posts%rowtype;
  v_claim public.claims%rowtype;
BEGIN
  FOR v_post IN
    SELECT *
    FROM public.food_posts
    WHERE status = 'reserved'
      AND reservation_expires_at IS NOT NULL
      AND reservation_expires_at <= now()
      AND expiration_at > now()
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT * INTO v_claim
    FROM public.claims
    WHERE food_post_id = v_post.id
      AND status IN ('pending','confirmed','ready_for_pickup')
    ORDER BY claimed_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_claim.id IS NOT NULL THEN
      UPDATE public.claims
      SET status = 'cancelled', cancelled_at = now(), updated_at = now()
      WHERE id = v_claim.id;

      UPDATE public.food_posts
      SET remaining_quantity = remaining_quantity + v_claim.quantity,
          status = 'available',
          reserved_by = NULL,
          reservation_expires_at = NULL,
          updated_at = now()
      WHERE id = v_post.id;

      INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, details)
      VALUES (
        NULL, 'reservation_expired', 'claim', v_claim.id,
        jsonb_build_object('food_post_id', v_post.id, 'quantity_restored', v_claim.quantity)
      );
      v_count := v_count + 1;
    ELSE
      UPDATE public.food_posts
      SET status = 'available', reserved_by = NULL, reservation_expires_at = NULL, updated_at = now()
      WHERE id = v_post.id;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_expired_reservations() FROM public;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations() TO authenticated;

-- ------------------------------------------------------------
-- Expiration now also handles reserved posts safely.
-- A food that expires while reserved becomes expired and its active claim is
-- cancelled. It is never returned to the public available pool.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_food_posts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_post public.food_posts%rowtype;
  v_claim public.claims%rowtype;
BEGIN
  FOR v_post IN
    SELECT *
    FROM public.food_posts
    WHERE expiration_at <= now()
      AND status IN ('draft','available','reserved','claimed','picked_up')
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_post.status = 'reserved' THEN
      SELECT * INTO v_claim
      FROM public.claims
      WHERE food_post_id = v_post.id
        AND status IN ('pending','confirmed','ready_for_pickup')
      ORDER BY claimed_at DESC
      LIMIT 1
      FOR UPDATE;

      IF v_claim.id IS NOT NULL THEN
        UPDATE public.claims
        SET status = 'cancelled', cancelled_at = now(), updated_at = now()
        WHERE id = v_claim.id;
      END IF;
    END IF;

    UPDATE public.food_posts
    SET status = 'expired', reserved_by = NULL, reservation_expires_at = NULL, updated_at = now()
    WHERE id = v_post.id;

    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, details)
    VALUES (
      NULL, 'food_post_expired', 'food_post', v_post.id,
      jsonb_build_object('expiration_at', v_post.expiration_at)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_food_posts() FROM public;
GRANT EXECUTE ON FUNCTION public.expire_food_posts() TO authenticated;

-- ------------------------------------------------------------
-- Atomic claim: the first successful transaction gets the reservation.
-- A 60-minute hold is used, never extending beyond the food's expiration.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_food(
  p_food_post_id uuid,
  p_quantity numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_food public.food_posts%rowtype;
  v_claim_id uuid;
  v_hold_until timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Claim quantity must be greater than zero';
  END IF;

  PERFORM public.release_expired_reservations();

  SELECT * INTO v_food
  FROM public.food_posts
  WHERE id = p_food_post_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Food post not found'; END IF;
  IF v_food.donor_id = auth.uid() THEN RAISE EXCEPTION 'You cannot claim your own food post'; END IF;

  IF v_food.expiration_at <= now() THEN
    UPDATE public.food_posts SET status = 'expired', updated_at = now() WHERE id = v_food.id;
    RAISE EXCEPTION 'Food post has expired';
  END IF;

  IF v_food.status <> 'available' THEN
    IF v_food.status = 'reserved' THEN
      RAISE EXCEPTION 'Food is currently being claimed by another recipient';
    END IF;
    RAISE EXCEPTION 'Food post is not available';
  END IF;

  IF p_quantity > v_food.remaining_quantity THEN
    RAISE EXCEPTION 'Claim quantity exceeds remaining available quantity';
  END IF;

  v_hold_until := LEAST(v_food.expiration_at, now() + interval '60 minutes');

  INSERT INTO public.claims (food_post_id, claimant_id, quantity, status)
  VALUES (v_food.id, auth.uid(), p_quantity, 'pending')
  RETURNING id INTO v_claim_id;

  UPDATE public.food_posts
  SET remaining_quantity = remaining_quantity - p_quantity,
      status = 'reserved',
      reserved_by = auth.uid(),
      reservation_expires_at = v_hold_until,
      updated_at = now()
  WHERE id = v_food.id;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(), 'claim_created', 'claim', v_claim_id,
    jsonb_build_object('food_post_id', v_food.id, 'quantity', p_quantity, 'reservation_expires_at', v_hold_until)
  );

  RETURN v_claim_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_food(uuid, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_food(uuid, numeric) TO authenticated;

-- ------------------------------------------------------------
-- Claim lifecycle: cancellation releases the reserved quantity; completion
-- returns any remaining quantity to available status.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_claim_status(
  p_claim_id uuid,
  p_status public.claim_status
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim public.claims%rowtype;
  v_post public.food_posts%rowtype;
  v_is_admin boolean;
  v_is_donor boolean;
  v_is_claimant boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_claim FROM public.claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim not found'; END IF;
  SELECT * INTO v_post FROM public.food_posts WHERE id = v_claim.food_post_id FOR UPDATE;

  v_is_admin := public.is_admin();
  v_is_donor := v_post.donor_id = auth.uid();
  v_is_claimant := v_claim.claimant_id = auth.uid();
  IF NOT (v_is_admin OR v_is_donor OR v_is_claimant) THEN RAISE EXCEPTION 'Not authorized to update this claim'; END IF;

  IF p_status = 'cancelled' THEN
    IF v_claim.status IN ('cancelled','completed','picked_up') THEN RAISE EXCEPTION 'Claim is already closed or picked up'; END IF;

    UPDATE public.claims
    SET status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), updated_at = now()
    WHERE id = v_claim.id;

    IF v_post.status = 'reserved' AND v_post.reserved_by = v_claim.claimant_id THEN
      IF v_post.expiration_at <= now() THEN
        UPDATE public.food_posts
        SET status = 'expired', reserved_by = NULL, reservation_expires_at = NULL, updated_at = now()
        WHERE id = v_post.id;
      ELSE
        UPDATE public.food_posts
        SET remaining_quantity = remaining_quantity + v_claim.quantity,
            status = CASE WHEN remaining_quantity + v_claim.quantity > 0 THEN 'available'::public.food_post_status ELSE status END,
            reserved_by = NULL,
            reservation_expires_at = NULL,
            updated_at = now()
        WHERE id = v_post.id;
      END IF;
    END IF;
  ELSE
    IF v_is_claimant AND NOT v_is_donor AND NOT v_is_admin AND p_status NOT IN ('ready_for_pickup') THEN
      RAISE EXCEPTION 'Recipients can only mark a reservation as ready for pickup or cancel it';
    END IF;

    IF p_status = 'completed' AND NOT (v_is_donor OR v_is_admin) THEN
      RAISE EXCEPTION 'Only the donor or an administrator can complete a pickup';
    END IF;

    UPDATE public.claims
    SET status = p_status,
        confirmed_at = CASE WHEN p_status = 'confirmed' THEN coalesce(confirmed_at, now()) ELSE confirmed_at END,
        ready_at = CASE WHEN p_status = 'ready_for_pickup' THEN coalesce(ready_at, now()) ELSE ready_at END,
        picked_up_at = CASE WHEN p_status = 'picked_up' THEN coalesce(picked_up_at, now()) ELSE picked_up_at END,
        completed_at = CASE WHEN p_status = 'completed' THEN coalesce(completed_at, now()) ELSE completed_at END,
        updated_at = now()
    WHERE id = v_claim.id;

    IF p_status = 'completed' THEN
      UPDATE public.food_posts
      SET status = CASE WHEN remaining_quantity > 0 THEN 'available'::public.food_post_status ELSE 'completed'::public.food_post_status END,
          completed_at = CASE WHEN remaining_quantity = 0 THEN coalesce(completed_at, now()) ELSE completed_at END,
          reserved_by = NULL,
          reservation_expires_at = NULL,
          updated_at = now()
      WHERE id = v_post.id;
    ELSIF p_status = 'picked_up' THEN
      UPDATE public.food_posts
      SET reservation_expires_at = NULL, updated_at = now()
      WHERE id = v_post.id AND status = 'reserved';
    END IF;
  END IF;

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'claim_status_updated', 'claim', p_claim_id, jsonb_build_object('status', p_status::text));
END;
$$;

REVOKE ALL ON FUNCTION public.update_claim_status(uuid, public.claim_status) FROM public;
GRANT EXECUTE ON FUNCTION public.update_claim_status(uuid, public.claim_status) TO authenticated;

-- Keep the defensive view aligned with the reservation state.
CREATE OR REPLACE VIEW public.available_food_posts
WITH (security_invoker = true)
AS
SELECT fp.*
FROM public.food_posts fp
WHERE fp.status = 'available'
  AND fp.remaining_quantity > 0
  AND fp.expiration_at > now();

-- Realtime lets other open browsers see a reservation immediately.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'food_posts'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.food_posts;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'claims'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.claims;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add food_posts to supabase_realtime: %', SQLERRM;
END $$;

-- ================================================================
-- SECTION 6: supabase-details-reports.sql
-- ================================================================

-- FRSS food details / pickup window / safety / reports migration
-- Run after the existing FRSS schema + location + expiration + reservation migrations.

ALTER TABLE public.food_posts
  ADD COLUMN IF NOT EXISTS pickup_available_from timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_available_until timestamptz,
  ADD COLUMN IF NOT EXISTS food_condition text,
  ADD COLUMN IF NOT EXISTS allergen_info text;

ALTER TABLE public.food_posts
  DROP CONSTRAINT IF EXISTS food_post_pickup_window_check;
ALTER TABLE public.food_posts
  ADD CONSTRAINT food_post_pickup_window_check
  CHECK (
    pickup_available_from IS NULL
    OR pickup_available_until IS NULL
    OR pickup_available_from < pickup_available_until
  );

ALTER TABLE public.food_posts
  DROP CONSTRAINT IF EXISTS food_post_pickup_before_expiry_check;
ALTER TABLE public.food_posts
  ADD CONSTRAINT food_post_pickup_before_expiry_check
  CHECK (
    pickup_available_until IS NULL
    OR pickup_available_until <= expiration_at
  );

CREATE INDEX IF NOT EXISTS idx_food_posts_pickup_window
  ON public.food_posts(pickup_available_from, pickup_available_until);

CREATE TABLE IF NOT EXISTS public.food_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_post_id uuid NOT NULL REFERENCES public.food_posts(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('expired','unavailable','location','inaccurate','safety','other')),
  details text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_food_reports_food_post_id ON public.food_reports(food_post_id);
CREATE INDEX IF NOT EXISTS idx_food_reports_status_created_at ON public.food_reports(status, created_at DESC);

ALTER TABLE public.food_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS food_reports_insert_own ON public.food_reports;
CREATE POLICY food_reports_insert_own ON public.food_reports
FOR INSERT TO authenticated
WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS food_reports_select_own_or_admin ON public.food_reports;
CREATE POLICY food_reports_select_own_or_admin ON public.food_reports
FOR SELECT TO authenticated
USING (reporter_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS food_reports_update_admin ON public.food_reports;
CREATE POLICY food_reports_update_admin ON public.food_reports
FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS food_reports_delete_admin ON public.food_reports;
CREATE POLICY food_reports_delete_admin ON public.food_reports
FOR DELETE TO authenticated
USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.set_food_report_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_food_report_updated_at ON public.food_reports;
CREATE TRIGGER trg_food_report_updated_at
BEFORE UPDATE ON public.food_reports
FOR EACH ROW EXECUTE FUNCTION public.set_food_report_updated_at();

-- ================================================================
-- SECTION 7: supabase-food-images.sql
-- ================================================================

-- ============================================================
-- FRSS FOOD IMAGE STORAGE
-- Run this once in the Supabase SQL Editor.
-- ============================================================
alter table public.food_posts add column if not exists image_url text;
alter table public.food_posts add column if not exists image_urls jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('food-images', 'food-images', true)
on conflict (id) do update set public = true;

drop policy if exists "food images public read" on storage.objects;
create policy "food images public read"
on storage.objects for select
to public
using (bucket_id = 'food-images');

drop policy if exists "food images authenticated upload own folder" on storage.objects;
create policy "food images authenticated upload own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'food-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "food images authenticated update own folder" on storage.objects;
create policy "food images authenticated update own folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'food-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'food-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "food images authenticated delete own folder" on storage.objects;
create policy "food images authenticated delete own folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'food-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- ================================================================
-- SECTION 8: supabase-claim-approval-notifications.sql
-- ================================================================

-- FRSS claim approval + notifications migration
-- Run this AFTER:
--   1) supabase-schema.sql
--   2) supabase-fix.sql (if used)
--   3) supabase-location.sql (if used)
--   4) supabase-expiration.sql (if used)
--   Reservation support is already included above in this all-in-one file.
--
-- Workflow:
--   Find Food user -> claim request (pending)
--   Donor -> Accept (confirmed) or Decline (cancelled)
--   Claimant -> ready_for_pickup
--   Donor -> picked_up -> completed
--
-- Notifications are stored in the database and delivered to open dashboards
-- through Supabase Realtime.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  claim_id uuid references public.claims(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_id_created_at
  on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_claim_id
  on public.notifications(claim_id);
create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, is_read, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
for select to authenticated
using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists notifications_insert_none on public.notifications;
create policy notifications_insert_none on public.notifications
for insert to authenticated
with check (false);

drop policy if exists notifications_delete_none on public.notifications;
create policy notifications_delete_none on public.notifications
for delete to authenticated
using (false);

-- A donor may see the names of people who have active claims on that donor's
-- food posts. A claimant may also see the donor name for their own claim.
drop policy if exists profiles_select_claim_participants on public.profiles;
create policy profiles_select_claim_participants on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or exists (
    select 1
    from public.claims c
    join public.food_posts fp on fp.id = c.food_post_id
    where fp.donor_id = auth.uid()
      and c.claimant_id = profiles.id
  )
  or exists (
    select 1
    from public.claims c
    join public.food_posts fp on fp.id = c.food_post_id
    where c.claimant_id = auth.uid()
      and fp.donor_id = profiles.id
  )
);

create or replace function public.create_notification(
  p_user_id uuid,
  p_claim_id uuid,
  p_type text,
  p_title text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  insert into public.notifications (user_id, claim_id, type, title, message)
  values (p_user_id, p_claim_id, p_type, p_title, p_message)
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;

revoke all on function public.create_notification(uuid, uuid, text, text, text) from public;

-- ------------------------------------------------------------
-- Expired reservations now notify both sides.
-- ------------------------------------------------------------
create or replace function public.release_expired_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_post public.food_posts%rowtype;
  v_claim public.claims%rowtype;
begin
  for v_post in
    select *
    from public.food_posts
    where status = 'reserved'
      and reservation_expires_at is not null
      and reservation_expires_at <= now()
      and expiration_at > now()
    for update skip locked
  loop
    select * into v_claim
    from public.claims
    where food_post_id = v_post.id
      and status in ('pending','confirmed','ready_for_pickup')
    order by claimed_at desc
    limit 1
    for update;

    if v_claim.id is not null then
      update public.claims
      set status = 'cancelled', cancelled_at = now(), updated_at = now()
      where id = v_claim.id;

      update public.food_posts
      set remaining_quantity = remaining_quantity + v_claim.quantity,
          status = 'available',
          reserved_by = null,
          reservation_expires_at = null,
          updated_at = now()
      where id = v_post.id;

      perform public.create_notification(
        v_claim.claimant_id,
        v_claim.id,
        'reservation_expired',
        'Claim request expired',
        'Your claim request for ' || v_post.food_name || ' expired before pickup and the food is available again.'
      );

      perform public.create_notification(
        v_post.donor_id,
        v_claim.id,
        'reservation_expired',
        'Claim request expired',
        'The claim request for ' || v_post.food_name || ' expired. The food is available again.'
      );

      insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
      values (
        null, 'reservation_expired', 'claim', v_claim.id,
        jsonb_build_object('food_post_id', v_post.id, 'quantity_restored', v_claim.quantity)
      );
      v_count := v_count + 1;
    else
      update public.food_posts
      set status = 'available', reserved_by = null, reservation_expires_at = null, updated_at = now()
      where id = v_post.id;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.release_expired_reservations() from public;
grant execute on function public.release_expired_reservations() to authenticated;

-- ------------------------------------------------------------
-- Expiration now notifies the claimant and donor.
-- ------------------------------------------------------------
create or replace function public.expire_food_posts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_post public.food_posts%rowtype;
  v_claim public.claims%rowtype;
begin
  for v_post in
    select *
    from public.food_posts
    where expiration_at <= now()
      and status in ('draft','available','reserved','claimed','picked_up')
    for update skip locked
  loop
    if v_post.status = 'reserved' then
      select * into v_claim
      from public.claims
      where food_post_id = v_post.id
        and status in ('pending','confirmed','ready_for_pickup')
      order by claimed_at desc
      limit 1
      for update;

      if v_claim.id is not null then
        update public.claims
        set status = 'cancelled', cancelled_at = now(), updated_at = now()
        where id = v_claim.id;

        perform public.create_notification(
          v_claim.claimant_id,
          v_claim.id,
          'food_expired',
          'Food post expired',
          'Your claim for ' || v_post.food_name || ' was cancelled because the food post expired.'
        );

        perform public.create_notification(
          v_post.donor_id,
          v_claim.id,
          'food_expired',
          'Food post expired',
          v_post.food_name || ' has expired and the pending claim was cancelled.'
        );
      end if;
    end if;

    update public.food_posts
    set status = 'expired', reserved_by = null, reservation_expires_at = null, updated_at = now()
    where id = v_post.id;

    insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
    values (
      null, 'food_post_expired', 'food_post', v_post.id,
      jsonb_build_object('expiration_at', v_post.expiration_at)
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.expire_food_posts() from public;
grant execute on function public.expire_food_posts() to authenticated;

-- ------------------------------------------------------------
-- Claim request: pending until the donor decides.
-- ------------------------------------------------------------
create or replace function public.claim_food(
  p_food_post_id uuid,
  p_quantity numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_food public.food_posts%rowtype;
  v_claim_id uuid;
  v_hold_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Claim quantity must be greater than zero';
  end if;

  perform public.release_expired_reservations();

  select * into v_food
  from public.food_posts
  where id = p_food_post_id
  for update;

  if not found then raise exception 'Food post not found'; end if;
  if v_food.donor_id = auth.uid() then raise exception 'You cannot claim your own food post'; end if;

  if v_food.expiration_at <= now() then
    update public.food_posts
    set status = 'expired', updated_at = now()
    where id = v_food.id;
    raise exception 'Food post has expired';
  end if;

  if v_food.status <> 'available' then
    if v_food.status = 'reserved' then
      raise exception 'Food is currently being claimed by another recipient';
    end if;
    raise exception 'Food post is not available';
  end if;

  if p_quantity > v_food.remaining_quantity then
    raise exception 'Claim quantity exceeds remaining available quantity';
  end if;

  v_hold_until := least(v_food.expiration_at, now() + interval '60 minutes');

  insert into public.claims (food_post_id, claimant_id, quantity, status)
  values (v_food.id, auth.uid(), p_quantity, 'pending')
  returning id into v_claim_id;

  update public.food_posts
  set remaining_quantity = remaining_quantity - p_quantity,
      status = 'reserved',
      reserved_by = auth.uid(),
      reservation_expires_at = v_hold_until,
      updated_at = now()
  where id = v_food.id;

  perform public.create_notification(
    v_food.donor_id,
    v_claim_id,
    'claim_request',
    'New claim request',
    'Someone requested ' || p_quantity || ' ' || coalesce(v_food.unit, 'unit(s)') || ' of ' || v_food.food_name || '. Open your dashboard to accept or decline the request.'
  );

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'claim_created', 'claim', v_claim_id,
    jsonb_build_object('food_post_id', v_food.id, 'quantity', p_quantity, 'reservation_expires_at', v_hold_until)
  );

  return v_claim_id;
end;
$$;

revoke all on function public.claim_food(uuid, numeric) from public;
grant execute on function public.claim_food(uuid, numeric) to authenticated;

-- ------------------------------------------------------------
-- Approval-aware claim lifecycle.
-- Donor: pending -> confirmed/cancelled, confirmed -> picked_up/cancelled,
--        ready_for_pickup -> picked_up, picked_up -> completed.
-- Claimant: pending/confirmed/ready_for_pickup -> cancelled, confirmed -> ready_for_pickup.
-- Admin: can manage any state.
-- ------------------------------------------------------------
create or replace function public.update_claim_status(
  p_claim_id uuid,
  p_status public.claim_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.claims%rowtype;
  v_post public.food_posts%rowtype;
  v_is_admin boolean;
  v_is_donor boolean;
  v_is_claimant boolean;
  v_old_status public.claim_status;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_claim
  from public.claims
  where id = p_claim_id
  for update;
  if not found then raise exception 'Claim not found'; end if;

  select * into v_post
  from public.food_posts
  where id = v_claim.food_post_id
  for update;

  v_old_status := v_claim.status;
  v_is_admin := public.is_admin();
  v_is_donor := v_post.donor_id = auth.uid();
  v_is_claimant := v_claim.claimant_id = auth.uid();

  if not (v_is_admin or v_is_donor or v_is_claimant) then
    raise exception 'Not authorized to update this claim';
  end if;

  if not v_is_admin then
    if v_old_status = 'pending' then
      if v_is_donor and p_status not in ('confirmed','cancelled') then
        raise exception 'Donors can only accept or decline a pending claim';
      elsif v_is_claimant and p_status <> 'cancelled' then
        raise exception 'Recipients can only cancel a pending claim';
      end if;
    elsif v_old_status = 'confirmed' then
      if v_is_claimant and p_status not in ('ready_for_pickup','cancelled') then
        raise exception 'Recipients can only mark an approved claim ready for pickup or cancel it';
      elsif v_is_donor and p_status not in ('picked_up','cancelled') then
        raise exception 'Donors can only mark an approved claim picked up or cancel it';
      end if;
    elsif v_old_status = 'ready_for_pickup' then
      if v_is_claimant and p_status <> 'cancelled' then
        raise exception 'Recipients can only cancel a ready claim';
      elsif v_is_donor and p_status <> 'picked_up' then
        raise exception 'Donors can only mark a ready claim picked up';
      end if;
    elsif v_old_status = 'picked_up' then
      if not v_is_donor then
        raise exception 'Only the donor can complete a pickup';
      end if;
      if p_status <> 'completed' then
        raise exception 'A picked up claim can only be completed';
      end if;
    elsif v_old_status in ('cancelled','completed') then
      raise exception 'Claim is already closed';
    end if;
  end if;

  if p_status = 'cancelled' then
    if v_old_status in ('cancelled','completed','picked_up') then
      raise exception 'Claim is already closed or picked up';
    end if;

    update public.claims
    set status = 'cancelled',
        cancelled_at = coalesce(cancelled_at, now()),
        updated_at = now()
    where id = v_claim.id;

    if v_post.status = 'reserved' and v_post.reserved_by = v_claim.claimant_id then
      if v_post.expiration_at <= now() then
        update public.food_posts
        set status = 'expired', reserved_by = null, reservation_expires_at = null, updated_at = now()
        where id = v_post.id;
      else
        update public.food_posts
        set remaining_quantity = remaining_quantity + v_claim.quantity,
            status = case
              when remaining_quantity + v_claim.quantity > 0 then 'available'::public.food_post_status
              else status
            end,
            reserved_by = null,
            reservation_expires_at = null,
            updated_at = now()
        where id = v_post.id;
      end if;
    end if;

    if v_is_donor or v_is_admin then
      perform public.create_notification(
        v_claim.claimant_id,
        v_claim.id,
        'claim_declined',
        'Claim declined',
        'Your claim request for ' || v_post.food_name || ' was declined. The food is available again.'
      );
    elsif v_is_claimant then
      perform public.create_notification(
        v_post.donor_id,
        v_claim.id,
        'claim_cancelled',
        'Claim cancelled',
        'The recipient cancelled the claim for ' || v_post.food_name || '. The food is available again.'
      );
    end if;
  else
    update public.claims
    set status = p_status,
        confirmed_at = case when p_status = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
        ready_at = case when p_status = 'ready_for_pickup' then coalesce(ready_at, now()) else ready_at end,
        picked_up_at = case when p_status = 'picked_up' then coalesce(picked_up_at, now()) else picked_up_at end,
        completed_at = case when p_status = 'completed' then coalesce(completed_at, now()) else completed_at end,
        updated_at = now()
    where id = v_claim.id;

    if p_status = 'confirmed' and v_old_status = 'pending' then
      perform public.create_notification(
        v_claim.claimant_id,
        v_claim.id,
        'claim_confirmed',
        'Claim accepted',
        'Your claim for ' || v_post.food_name || ' was accepted by the donor. Check your dashboard for pickup details.'
      );
    elsif p_status = 'ready_for_pickup' then
      perform public.create_notification(
        v_post.donor_id,
        v_claim.id,
        'ready_for_pickup',
        'Recipient is on the way',
        'The recipient marked the claim for ' || v_post.food_name || ' as ready for pickup.'
      );
    elsif p_status = 'picked_up' then
      perform public.create_notification(
        v_claim.claimant_id,
        v_claim.id,
        'picked_up',
        'Pickup recorded',
        'Pickup for ' || v_post.food_name || ' has been recorded by the donor.'
      );
    elsif p_status = 'completed' then
      perform public.create_notification(
        v_claim.claimant_id,
        v_claim.id,
        'completed',
        'Rescue completed',
        'Your food rescue for ' || v_post.food_name || ' is complete. Thank you for helping reduce food waste.'
      );
    end if;

    if p_status = 'completed' then
      update public.food_posts
      set status = case
        when remaining_quantity > 0 then 'available'::public.food_post_status
        else 'completed'::public.food_post_status
      end,
      completed_at = case when remaining_quantity = 0 then coalesce(completed_at, now()) else completed_at end,
      reserved_by = null,
      reservation_expires_at = null,
      updated_at = now()
      where id = v_post.id;
    elsif p_status = 'picked_up' then
      update public.food_posts
      set reservation_expires_at = null,
          updated_at = now()
      where id = v_post.id and status = 'reserved';
    end if;
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    auth.uid(), 'claim_status_updated', 'claim', p_claim_id,
    jsonb_build_object('from_status', v_old_status::text, 'status', p_status::text)
  );
end;
$$;

revoke all on function public.update_claim_status(uuid, public.claim_status) from public;
grant execute on function public.update_claim_status(uuid, public.claim_status) to authenticated;

-- Realtime for notification badges/messages. The rest of the project already
-- enables realtime for food_posts and claims in the reservation migration.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when others then
  raise notice 'Could not add notifications to supabase_realtime: %', sqlerrm;
end $$;

-- Optional helper for one-click "mark all read" from trusted client code.
-- The table RLS policy still restricts updates to the signed-in user's own rows.

-- ================================================================
-- SECTION 9: supabase-admin-complete.sql
-- ================================================================

-- FRSS COMPLETE ADMIN CONTROL CENTER
-- Run after the existing FRSS schema + reservation + details/reports migrations.
-- Adds moderation, verification, disputes, reputation, settings, locations,
-- announcements, suspension/archive controls, and admin case history.

alter table public.profiles
  add column if not exists account_status text not null default 'active' check (account_status in ('active','suspended','banned')),
  add column if not exists verification_status text not null default 'unverified' check (verification_status in ('unverified','pending','verified','rejected')),
  add column if not exists verification_notes text,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references public.profiles(id) on delete set null,
  add column if not exists suspension_reason text;

alter table public.food_posts
  add column if not exists moderation_status text not null default 'approved' check (moderation_status in ('pending','approved','rejected','hidden')),
  add column if not exists moderation_reason text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.profiles(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null;

alter table public.claims
  add column if not exists pickup_window_from timestamptz,
  add column if not exists pickup_window_until timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists no_show_at timestamptz,
  add column if not exists no_show_by uuid references public.profiles(id) on delete set null,
  add column if not exists no_show_grace_until timestamptz,
  add column if not exists issue_status text not null default 'none' check (issue_status in ('none','open','investigating','resolved','closed'));

create table if not exists public.claim_reports (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('food_unavailable','wrong_quantity','food_unsafe','donor_no_show','recipient_no_show','wrong_location','other')),
  details text,
  status text not null default 'open' check (status in ('open','investigating','resolved','closed','dismissed')),
  resolution text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reputation_ratings (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  rated_user_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  feedback text,
  created_at timestamptz not null default now(),
  unique (claim_id, rater_id, rated_user_id)
);

create table if not exists public.admin_cases (
  id uuid primary key default gen_random_uuid(),
  case_number bigint generated always as identity unique,
  source_type text not null check (source_type in ('claim_report','food_report','no_show','cancellation','moderation','user_report','other')),
  source_id uuid,
  subject text not null,
  description text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','investigating','resolved','closed','dismissed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  resolution text,
  created_by uuid references public.profiles(id) on delete set null,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.admin_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  audience text not null default 'all' check (audience in ('all','donors','recipients','admins')),
  is_active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pickup_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text,
  instructions text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_account_status on public.profiles(account_status);
create index if not exists idx_profiles_verification_status on public.profiles(verification_status);
create index if not exists idx_food_posts_moderation_status on public.food_posts(moderation_status);
create index if not exists idx_claim_reports_status on public.claim_reports(status, created_at desc);
create index if not exists idx_reputation_ratings_rated_user on public.reputation_ratings(rated_user_id);
create index if not exists idx_admin_cases_status on public.admin_cases(status, created_at desc);
create index if not exists idx_admin_announcements_active on public.admin_announcements(is_active, starts_at);

insert into public.system_settings(key,value,description) values
 ('pickup_grace_minutes','60'::jsonb,'Grace period before a pickup can be reported as a no-show.'),
 ('max_claims_per_user','10'::jsonb,'Maximum number of active claims per recipient.'),
 ('auto_expire_enabled','true'::jsonb,'Whether expiration processing should be enabled.'),
 ('require_food_moderation','false'::jsonb,'Whether new food posts require admin approval before listing.')
on conflict (key) do nothing;

create or replace function public.admin_set_user_status(p_user_id uuid,p_status text,p_reason text default null)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_status not in ('active','suspended','banned') then raise exception 'Invalid account status'; end if;
  update public.profiles set account_status=p_status, suspension_reason=case when p_status='active' then null else p_reason end,
    suspended_at=case when p_status='active' then null else now() end,
    suspended_by=case when p_status='active' then null else auth.uid() end, updated_at=now() where id=p_user_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'user_status_changed','profile',p_user_id,jsonb_build_object('status',p_status,'reason',p_reason));
  return found;
end; $$;

create or replace function public.admin_set_verification(p_user_id uuid,p_status text,p_notes text default null)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_status not in ('unverified','pending','verified','rejected') then raise exception 'Invalid verification status'; end if;
  update public.profiles set verification_status=p_status, verification_notes=p_notes, updated_at=now() where id=p_user_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'user_verification_changed','profile',p_user_id,jsonb_build_object('status',p_status,'notes',p_notes));
  return found;
end; $$;

create or replace function public.admin_moderate_food(p_food_id uuid,p_action text,p_reason text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_status text;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_action not in ('approve','reject','hide','restore','archive') then raise exception 'Invalid moderation action'; end if;
  if p_action='approve' then v_status='approved';
  elsif p_action='reject' then v_status='rejected';
  elsif p_action='hide' then v_status='hidden';
  elsif p_action='restore' then v_status='approved';
  else v_status='approved'; end if;
  update public.food_posts set moderation_status=v_status, moderation_reason=p_reason, moderated_at=now(), moderated_by=auth.uid(),
    archived_at=case when p_action='archive' then now() else archived_at end,
    archived_by=case when p_action='archive' then auth.uid() else archived_by end,
    updated_at=now() where id=p_food_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'food_moderated','food_post',p_food_id,jsonb_build_object('action',p_action,'reason',p_reason));
  return found;
end; $$;

create or replace function public.admin_update_case(p_case_id uuid,p_status text,p_resolution text default null,p_assignee uuid default null)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  update public.admin_cases set status=p_status,resolution=p_resolution,assigned_to=coalesce(p_assignee,assigned_to),
    resolved_by=case when p_status in ('resolved','closed','dismissed') then auth.uid() else resolved_by end,
    resolved_at=case when p_status in ('resolved','closed','dismissed') then now() else null end,updated_at=now() where id=p_case_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'admin_case_updated','admin_case',p_case_id,jsonb_build_object('status',p_status,'resolution',p_resolution));
  return found;
end; $$;

create or replace function public.admin_update_setting(p_key text,p_value jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  insert into public.system_settings(key,value,updated_by,updated_at) values(p_key,p_value,auth.uid(),now())
  on conflict(key) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now();
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'system_setting_changed','system_setting',null,jsonb_build_object('key',p_key,'value',p_value));
  return true;
end; $$;

create or replace function public.admin_no_show(p_claim_id uuid,p_reason text default 'Recipient did not arrive')
returns boolean language plpgsql security definer set search_path=public as $$
declare v_claim public.claims%rowtype; v_food public.food_posts%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into v_claim from public.claims where id=p_claim_id for update;
  if not found then raise exception 'Claim not found'; end if;
  select * into v_food from public.food_posts where id=v_claim.food_post_id for update;
  update public.claims set status='cancelled',no_show_at=now(),no_show_by=auth.uid(),issue_status='resolved',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=p_reason,updated_at=now() where id=p_claim_id;
  update public.food_posts set remaining_quantity=remaining_quantity+v_claim.quantity,status=case when remaining_quantity+v_claim.quantity>0 then 'available' else status end,
    reserved_by=null,reservation_expires_at=null,updated_at=now() where id=v_food.id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'no_show_reported','claim',p_claim_id,jsonb_build_object('reason',p_reason,'quantity_released',v_claim.quantity));
  return true;
end; $$;

create or replace function public.admin_archive_food(p_food_id uuid,p_reason text default 'Archived by administrator')
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  update public.food_posts set archived_at=now(),archived_by=auth.uid(),moderation_reason=p_reason,updated_at=now() where id=p_food_id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'food_archived','food_post',p_food_id,jsonb_build_object('reason',p_reason));
  return found;
end; $$;

create or replace function public.admin_resolve_claim_report(p_report_id uuid,p_status text,p_resolution text default null)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  update public.claim_reports set status=p_status,resolution=p_resolution,resolved_by=case when p_status in ('resolved','closed','dismissed') then auth.uid() else resolved_by end,resolved_at=case when p_status in ('resolved','closed','dismissed') then now() else null end,updated_at=now() where id=p_report_id;
  return found;
end; $$;

alter table public.claim_reports enable row level security;
alter table public.reputation_ratings enable row level security;
alter table public.admin_cases enable row level security;
alter table public.admin_announcements enable row level security;
alter table public.pickup_locations enable row level security;
alter table public.system_settings enable row level security;

drop policy if exists claim_reports_select on public.claim_reports;
create policy claim_reports_select on public.claim_reports for select to authenticated using (reporter_id=auth.uid() or public.is_admin() or exists(select 1 from public.claims c join public.food_posts f on f.id=c.food_post_id where c.id=claim_reports.claim_id and (c.claimant_id=auth.uid() or f.donor_id=auth.uid())));
drop policy if exists claim_reports_insert on public.claim_reports;
create policy claim_reports_insert on public.claim_reports for insert to authenticated with check (reporter_id=auth.uid());
drop policy if exists claim_reports_admin_update on public.claim_reports;
create policy claim_reports_admin_update on public.claim_reports for update to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists reputation_select on public.reputation_ratings;
create policy reputation_select on public.reputation_ratings for select to authenticated using(rater_id=auth.uid() or rated_user_id=auth.uid() or public.is_admin());
drop policy if exists reputation_insert on public.reputation_ratings;
create policy reputation_insert on public.reputation_ratings for insert to authenticated with check(rater_id=auth.uid());

drop policy if exists admin_cases_admin on public.admin_cases;
create policy admin_cases_admin on public.admin_cases for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists announcements_read on public.admin_announcements;
create policy announcements_read on public.admin_announcements for select to authenticated using(is_active and starts_at<=now() and (ends_at is null or ends_at>now()) or public.is_admin());
drop policy if exists announcements_admin on public.admin_announcements;
create policy announcements_admin on public.admin_announcements for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists locations_read on public.pickup_locations;
create policy locations_read on public.pickup_locations for select to authenticated using(is_active or public.is_admin());
drop policy if exists locations_admin on public.pickup_locations;
create policy locations_admin on public.pickup_locations for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists settings_admin on public.system_settings;
create policy settings_admin on public.system_settings for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop trigger if exists claim_reports_updated_at on public.claim_reports;
create trigger claim_reports_updated_at before update on public.claim_reports for each row execute function public.set_updated_at();
drop trigger if exists admin_cases_updated_at on public.admin_cases;
create trigger admin_cases_updated_at before update on public.admin_cases for each row execute function public.set_updated_at();
drop trigger if exists announcements_updated_at on public.admin_announcements;
create trigger announcements_updated_at before update on public.admin_announcements for each row execute function public.set_updated_at();
drop trigger if exists pickup_locations_updated_at on public.pickup_locations;
create trigger pickup_locations_updated_at before update on public.pickup_locations for each row execute function public.set_updated_at();
drop trigger if exists system_settings_updated_at on public.system_settings;
create trigger system_settings_updated_at before update on public.system_settings for each row execute function public.set_updated_at();

revoke all on function public.admin_set_user_status(uuid,text,text) from public;
grant execute on function public.admin_set_user_status(uuid,text,text) to authenticated;
revoke all on function public.admin_set_verification(uuid,text,text) from public;
grant execute on function public.admin_set_verification(uuid,text,text) to authenticated;
revoke all on function public.admin_moderate_food(uuid,text,text) from public;
grant execute on function public.admin_moderate_food(uuid,text,text) to authenticated;
revoke all on function public.admin_update_case(uuid,text,text,uuid) from public;
grant execute on function public.admin_update_case(uuid,text,text,uuid) to authenticated;
revoke all on function public.admin_update_setting(text,jsonb) from public;
grant execute on function public.admin_update_setting(text,jsonb) to authenticated;
revoke all on function public.admin_no_show(uuid,text) from public;
grant execute on function public.admin_no_show(uuid,text) to authenticated;
revoke all on function public.admin_archive_food(uuid,text) from public;
grant execute on function public.admin_archive_food(uuid,text) to authenticated;
revoke all on function public.admin_resolve_claim_report(uuid,text,text) from public;
grant execute on function public.admin_resolve_claim_report(uuid,text,text) to authenticated;


-- Automatically open an admin case when a food/claim report is filed.
create or replace function public.open_admin_case_from_claim_report()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.admin_cases(source_type,source_id,subject,description,priority,created_by)
  values('claim_report',new.id,'Claim problem reported',coalesce(new.details,new.reason),'high',new.reporter_id);
  return new;
end; $$;
drop trigger if exists trg_claim_report_admin_case on public.claim_reports;
create trigger trg_claim_report_admin_case after insert on public.claim_reports for each row execute function public.open_admin_case_from_claim_report();

create or replace function public.open_admin_case_from_food_report()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.admin_cases(source_type,source_id,subject,description,priority,created_by)
  values('food_report',new.id,'Food post reported',coalesce(new.details,new.reason),'high',new.reporter_id);
  return new;
end; $$;
drop trigger if exists trg_food_report_admin_case on public.food_reports;
create trigger trg_food_report_admin_case after insert on public.food_reports for each row execute function public.open_admin_case_from_food_report();

-- Keep public listings from showing moderated/archived posts.
drop policy if exists food_posts_select on public.food_posts;
create policy food_posts_select on public.food_posts
for select to anon, authenticated
using (
  ((status in ('available','reserved') and expiration_at > now() and remaining_quantity > 0)
   and coalesce(moderation_status,'approved')='approved' and archived_at is null)
  or donor_id = auth.uid()
  or public.has_claim_for_food_post(food_posts.id)
  or public.is_admin()
);

-- ================================================================
-- SECTION 10: supabase-enhancements.sql
-- ================================================================

-- FRSS ENHANCEMENTS
-- Run AFTER the existing FRSS schema, reservation, claim/notification,
-- details/reports, and admin migrations.
--
-- Adds/enforces:
-- 1. Real system settings behavior (moderation + max active claims + expiration)
-- 2. User profile/account settings and account closure
-- 3. User activity/history
-- 4. Admin rescue analytics
-- 5. Reputation submission workflow
-- 6. User report history
-- 7. Food-safety acknowledgement
-- 8. Pickup verification code
-- 9. One active claim per user per food post
-- 10. Stronger RLS for profile/admin fields and food posting

-- ============================================================
-- PROFILE / ACCOUNT
-- ============================================================
alter table public.profiles
  add column if not exists closed_at timestamptz;

-- Users must not be able to edit role, account status, verification, etc.
-- Profile changes go through update_my_profile().
drop policy if exists profiles_update_own on public.profiles;

create or replace function public.update_my_profile(
  p_full_name text,
  p_phone text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and account_status = 'active'
  ) then
    raise exception 'Account is not active';
  end if;

  update public.profiles
  set full_name = left(trim(coalesce(p_full_name,'')), 120),
      phone = nullif(left(trim(coalesce(p_phone,'')), 40), ''),
      updated_at = now()
  where id = auth.uid();

  return found;
end;
$$;

revoke all on function public.update_my_profile(text,text) from public;
grant execute on function public.update_my_profile(text,text) to authenticated;

-- ============================================================
-- FOOD SAFETY + MODERATION
-- ============================================================
alter table public.food_posts
  add column if not exists food_safety_confirmed boolean not null default false,
  add column if not exists food_safety_confirmed_at timestamptz;

create index if not exists idx_food_posts_food_safety on public.food_posts(food_safety_confirmed);

create or replace function public.frss_setting_bool(p_key text, p_default boolean default false)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when value is null then p_default
    when jsonb_typeof(value) = 'boolean' then (value #>> '{}')::boolean
    when jsonb_typeof(value) = 'string' then lower(trim(value #>> '{}')) = 'true'
    else p_default
  end
  from public.system_settings
  where key = p_key;
$$;

create or replace function public.frss_setting_number(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
    when value is null then p_default
    when jsonb_typeof(value) = 'number' then (value #>> '{}')::numeric
    when jsonb_typeof(value) = 'string' then nullif(value #>> '{}','')::numeric
    else p_default
  end
  from public.system_settings
  where key = p_key;
$$;

revoke all on function public.frss_setting_bool(text,boolean) from public;
grant execute on function public.frss_setting_bool(text,boolean) to authenticated;
revoke all on function public.frss_setting_number(text,numeric) from public;
grant execute on function public.frss_setting_number(text,numeric) to authenticated;

create or replace function public.prepare_food_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_requires_moderation boolean;
  v_is_admin boolean;
begin
  select * into v_profile from public.profiles where id = auth.uid();

  -- System/admin updates are allowed to pass through unchanged.
  if TG_OP = 'UPDATE' then
    if auth.uid() is null or public.is_admin() then return new; end if;
    -- A pending post cannot be self-promoted into an approved listing.
    if old.moderation_status = 'pending' and not (new.status = 'expired' and new.expiration_at <= now()) then
      new.moderation_status := 'pending';
      new.status := 'draft';
      new.published_at := null;
    else
      new.moderation_status := old.moderation_status;
    end if;
    if old.food_safety_confirmed then
      new.food_safety_confirmed := true;
      new.food_safety_confirmed_at := coalesce(old.food_safety_confirmed_at,new.food_safety_confirmed_at,now());
    end if;
    return new;
  end if;

  if auth.uid() is null or v_profile.id is null then
    raise exception 'Authentication required';
  end if;
  if v_profile.account_status <> 'active' then
    raise exception 'Your account is not active';
  end if;
  if v_profile.verification_status <> 'verified' and v_profile.role <> 'admin' then
    raise exception 'Your account must be verified before posting food';
  end if;
  if not coalesce(new.food_safety_confirmed,false) and v_profile.role <> 'admin' then
    raise exception 'Please confirm that the food is safe to share';
  end if;

  if new.food_safety_confirmed then
    new.food_safety_confirmed_at = coalesce(new.food_safety_confirmed_at, now());
  end if;

  v_is_admin := v_profile.role = 'admin';
  v_requires_moderation := public.frss_setting_bool('require_food_moderation', false);

  if not v_is_admin then
    if v_requires_moderation then
      new.moderation_status := 'pending';
      new.status := 'draft';
      new.published_at := null;
    else
      new.moderation_status := 'approved';
      if new.status = 'draft' then new.status := 'available'; end if;
      if new.status = 'available' then new.published_at := coalesce(new.published_at, now()); end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prepare_food_post on public.food_posts;
create trigger trg_prepare_food_post
before insert or update on public.food_posts
for each row execute function public.prepare_food_post();

-- Rebuild food-post write policies so regular users cannot forge moderation,
-- status, or account/verification state.
drop policy if exists food_posts_insert_own on public.food_posts;
create policy food_posts_insert_own on public.food_posts
for insert to authenticated
with check (
  donor_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.account_status = 'active'
      and (p.verification_status = 'verified' or p.role = 'admin')
  )
  and coalesce(food_safety_confirmed,false) = true
  and (
    public.is_admin()
    or (
      public.frss_setting_bool('require_food_moderation', false)
      and status = 'draft'
      and moderation_status = 'pending'
    )
    or (
      not public.frss_setting_bool('require_food_moderation', false)
      and status = 'available'
      and moderation_status = 'approved'
    )
  )
);

drop policy if exists food_posts_update_own_or_admin on public.food_posts;
create policy food_posts_update_own_or_admin on public.food_posts
for update to authenticated
using (donor_id = auth.uid() or public.is_admin())
with check (
  public.is_admin()
  or (
    donor_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.account_status = 'active'
        and p.verification_status = 'verified'
    )
    and coalesce(food_safety_confirmed,false) = true
    and (
      (moderation_status = 'approved' and status in ('available','reserved','claimed','picked_up','completed','cancelled','expired'))
      or (moderation_status = 'pending' and status = 'draft')
    )
  )
);

-- Make admin approval actually publish a moderated draft.
create or replace function public.admin_moderate_food(
  p_food_id uuid,
  p_action text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.food_posts%rowtype;
  v_status text;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_action not in ('approve','reject','hide','restore','archive') then raise exception 'Invalid moderation action'; end if;
  select * into v_post from public.food_posts where id = p_food_id for update;
  if not found then raise exception 'Food post not found'; end if;

  if p_action = 'approve' then
    v_status := 'approved';
    update public.food_posts
    set moderation_status = v_status,
        moderation_reason = p_reason,
        moderated_at = now(),
        moderated_by = auth.uid(),
        status = case when expiration_at > now() and remaining_quantity > 0 then 'available'::public.food_post_status else 'expired'::public.food_post_status end,
        published_at = coalesce(published_at, now()),
        archived_at = null,
        archived_by = null,
        updated_at = now()
    where id = p_food_id;
  elsif p_action = 'reject' then
    update public.food_posts
    set moderation_status = 'rejected', moderation_reason = p_reason, moderated_at = now(), moderated_by = auth.uid(), status = 'draft', published_at = null, updated_at = now()
    where id = p_food_id;
  elsif p_action = 'hide' then
    update public.food_posts
    set moderation_status = 'hidden', moderation_reason = p_reason, moderated_at = now(), moderated_by = auth.uid(), updated_at = now()
    where id = p_food_id;
  elsif p_action = 'restore' then
    update public.food_posts
    set moderation_status = 'approved', moderation_reason = p_reason, moderated_at = now(), moderated_by = auth.uid(),
        status = case when expiration_at > now() and remaining_quantity > 0 then 'available'::public.food_post_status else 'expired'::public.food_post_status end,
        archived_at = null, archived_by = null, updated_at = now()
    where id = p_food_id;
  else
    update public.food_posts
    set archived_at = now(), archived_by = auth.uid(), moderation_reason = p_reason, updated_at = now()
    where id = p_food_id;
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),'food_moderated','food_post',p_food_id,jsonb_build_object('action',p_action,'reason',p_reason));
  return true;
end;
$$;

revoke all on function public.admin_moderate_food(uuid,text,text) from public;
grant execute on function public.admin_moderate_food(uuid,text,text) to authenticated;

-- ============================================================
-- CLAIM RULES + ONE ACTIVE CLAIM PER USER/FOOD
-- ============================================================
-- Close duplicate active claims before adding the unique index. The newest
-- claim remains active. Older duplicates are cancelled and any held quantity
-- is returned to the related food post.
do $$
declare
  r record;
begin
  for r in
    select c.id, c.food_post_id, c.quantity, fp.status as post_status, fp.reserved_by, fp.expiration_at
    from public.claims c
    join public.food_posts fp on fp.id=c.food_post_id
    where c.status in ('pending','confirmed','ready_for_pickup','picked_up')
      and exists (
        select 1 from public.claims newer
        where newer.food_post_id=c.food_post_id
          and newer.claimant_id=c.claimant_id
          and newer.status in ('pending','confirmed','ready_for_pickup','picked_up')
          and (newer.claimed_at,newer.created_at,newer.id) > (c.claimed_at,c.created_at,c.id)
      )
  loop
    update public.claims
    set status='cancelled', cancelled_at=coalesce(cancelled_at,now()), cancellation_reason='Duplicate active claim closed by system', updated_at=now()
    where id=r.id;

    if r.post_status='reserved' and r.reserved_by is not null then
      update public.food_posts
      set remaining_quantity=remaining_quantity+r.quantity,
          status=case when expiration_at>now() then 'available'::public.food_post_status else 'expired'::public.food_post_status end,
          reserved_by=null,reservation_expires_at=null,updated_at=now()
      where id=r.food_post_id and reserved_by=(select claimant_id from public.claims where id=r.id);
    end if;
  end loop;
end;
$$;

create unique index if not exists uq_claim_one_active_per_user_food
on public.claims(food_post_id, claimant_id)
where status in ('pending','confirmed','ready_for_pickup','picked_up');

create index if not exists idx_claims_active_claimant on public.claims(claimant_id)
where status in ('pending','confirmed','ready_for_pickup','picked_up');

alter table public.claims
  add column if not exists pickup_code text;

create unique index if not exists uq_claim_pickup_code
on public.claims(pickup_code)
where pickup_code is not null;

update public.claims
set pickup_code=upper(substr(encode(gen_random_bytes(4),'hex'),1,6))
where pickup_code is null
  and status in ('pending','confirmed','ready_for_pickup','picked_up');

-- Replace the approval-aware claim RPC with the final rules.
-- This keeps the 60-minute reservation behavior while adding account,
-- verification, active-claim-limit, duplicate-claim, and pickup-code checks.
drop function if exists public.claim_food(uuid,numeric);
create function public.claim_food(
  p_food_post_id uuid,
  p_quantity numeric
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_food public.food_posts%rowtype;
  v_profile public.profiles%rowtype;
  v_claim_id uuid;
  v_hold_until timestamptz;
  v_max_claims integer;
  v_active_claims integer;
  v_pickup_code text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_profile from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Your user profile could not be found'; end if;
  if v_profile.account_status <> 'active' then raise exception 'Your account is not active'; end if;
  if v_profile.verification_status <> 'verified' and v_profile.role <> 'admin' then raise exception 'Your account must be verified before claiming food'; end if;
  if p_quantity is null or p_quantity::text in ('NaN','Infinity','-Infinity') or p_quantity <= 0 then raise exception 'Claim quantity must be greater than zero'; end if;

  perform public.release_expired_reservations();

  if exists (
    select 1 from public.claims c
    where c.food_post_id = p_food_post_id
      and c.claimant_id = auth.uid()
      and c.status in ('pending','confirmed','ready_for_pickup','picked_up')
  ) then
    raise exception 'You already have an active claim for this food post';
  end if;

  v_max_claims := greatest(1, floor(public.frss_setting_number('max_claims_per_user',10))::integer);
  select count(*) into v_active_claims
  from public.claims
  where claimant_id = auth.uid()
    and status in ('pending','confirmed','ready_for_pickup','picked_up');
  if v_active_claims >= v_max_claims then
    raise exception 'You have reached the maximum of % active claims', v_max_claims;
  end if;

  select * into v_food from public.food_posts where id = p_food_post_id for update;
  if not found then raise exception 'Food post not found'; end if;
  if v_food.donor_id = auth.uid() then raise exception 'You cannot claim your own food post'; end if;
  if coalesce(v_food.moderation_status,'approved') <> 'approved' or v_food.archived_at is not null then raise exception 'Food post is not available'; end if;
  if v_food.expiration_at <= now() then
    update public.food_posts set status='expired',updated_at=now() where id=v_food.id;
    raise exception 'Food post has expired';
  end if;
  if v_food.status <> 'available' then
    if v_food.status = 'reserved' then raise exception 'Food is currently being claimed by another recipient'; end if;
    raise exception 'Food post is not available';
  end if;
  if p_quantity > v_food.remaining_quantity then raise exception 'Claim quantity exceeds remaining available quantity'; end if;

  v_hold_until := least(v_food.expiration_at, now() + interval '60 minutes');
  v_pickup_code := upper(substr(encode(gen_random_bytes(4),'hex'),1,6));

  insert into public.claims(food_post_id,claimant_id,quantity,status,pickup_code)
  values(v_food.id,auth.uid(),p_quantity,'pending',v_pickup_code)
  returning id into v_claim_id;

  update public.food_posts
  set remaining_quantity = remaining_quantity - p_quantity,
      status = 'reserved',
      reserved_by = auth.uid(),
      reservation_expires_at = v_hold_until,
      updated_at = now()
  where id=v_food.id;

  perform public.create_notification(v_food.donor_id,v_claim_id,'claim_request','New claim request',
    'Someone requested ' || p_quantity || ' ' || coalesce(v_food.unit,'unit(s)') || ' of ' || v_food.food_name || '. Open your dashboard to accept or decline the request.');

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),'claim_created','claim',v_claim_id,
    jsonb_build_object('food_post_id',v_food.id,'quantity',p_quantity,'reservation_expires_at',v_hold_until));

  return v_claim_id;
exception
  when unique_violation then
    raise exception 'You already have an active claim for this food post';
end;
$$;

revoke all on function public.claim_food(uuid,numeric) from public;
grant execute on function public.claim_food(uuid,numeric) to authenticated;

-- ============================================================
-- PICKUP VERIFICATION CODE
-- ============================================================
-- The donor must provide the correct code to mark a ready claim as picked up.
drop function if exists public.update_claim_status(uuid,public.claim_status);
drop function if exists public.update_claim_status(uuid,public.claim_status,text);
create or replace function public.update_claim_status(
  p_claim_id uuid,
  p_status public.claim_status,
  p_pickup_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.claims%rowtype;
  v_post public.food_posts%rowtype;
  v_is_admin boolean;
  v_is_donor boolean;
  v_is_claimant boolean;
  v_old_status public.claim_status;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_status is null then raise exception 'Claim status is required'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and account_status='active') then
    raise exception 'Your account is not active';
  end if;
  select * into v_claim from public.claims where id=p_claim_id;
  if not found then raise exception 'Claim not found'; end if;
  select * into v_post from public.food_posts where id=v_claim.food_post_id for update;
  select * into v_claim from public.claims where id=p_claim_id for update;

  v_is_admin := public.is_admin();
  v_is_donor := v_post.donor_id = auth.uid();
  v_is_claimant := v_claim.claimant_id = auth.uid();
  if not (v_is_admin or v_is_donor or v_is_claimant) then raise exception 'Not authorized to update this claim'; end if;
  v_old_status := v_claim.status;
  if p_status <> 'cancelled' and v_old_status in ('pending','confirmed','ready_for_pickup')
     and (v_post.expiration_at <= now() or v_post.status <> 'reserved'
          or v_post.reserved_by is distinct from v_claim.claimant_id
          or v_post.reservation_expires_at is null or v_post.reservation_expires_at <= now()) then
    raise exception 'This reservation has expired or is no longer available';
  end if;
  if not (
    (v_old_status='pending' and p_status in ('confirmed','cancelled'))
    or (v_old_status='confirmed' and p_status in ('ready_for_pickup','cancelled'))
    or (v_old_status='ready_for_pickup' and p_status in ('picked_up','cancelled'))
    or (v_old_status='picked_up' and p_status='completed')
  ) then raise exception 'Invalid claim status transition'; end if;

  if p_status = 'cancelled' then
    if v_claim.status in ('cancelled','completed','picked_up') then raise exception 'Claim is already closed or picked up'; end if;
    update public.claims set status='cancelled',cancelled_at=coalesce(cancelled_at,now()),updated_at=now() where id=v_claim.id;
    if v_post.status='reserved' and v_post.reserved_by=v_claim.claimant_id then
      if v_post.expiration_at<=now() then
        update public.food_posts set status='expired',reserved_by=null,reservation_expires_at=null,updated_at=now() where id=v_post.id;
      else
        update public.food_posts set remaining_quantity=remaining_quantity+v_claim.quantity,status='available',reserved_by=null,reservation_expires_at=null,updated_at=now() where id=v_post.id;
      end if;
    end if;
    if v_is_donor or v_is_admin then
      perform public.create_notification(v_claim.claimant_id,v_claim.id,'claim_declined','Claim declined','Your claim for '||v_post.food_name||' was declined. The food is available again.');
    else
      perform public.create_notification(v_post.donor_id,v_claim.id,'claim_cancelled','Claim cancelled','The recipient cancelled the claim for '||v_post.food_name||'. The food is available again.');
    end if;
  else
    if v_old_status='pending' then
      if v_is_donor and p_status not in ('confirmed') then raise exception 'Donors can only accept a pending claim or cancel it'; end if;
      if v_is_claimant and p_status <> 'cancelled' then raise exception 'Recipients can only cancel a pending claim'; end if;
    elsif v_old_status='confirmed' then
      if v_is_claimant and p_status <> 'ready_for_pickup' then raise exception 'Recipients can only mark an approved claim ready for pickup or cancel it'; end if;
      if v_is_donor and p_status <> 'picked_up' then raise exception 'Donors can only mark an approved claim picked up or cancel it'; end if;
    elsif v_old_status='ready_for_pickup' then
      if v_is_claimant and p_status <> 'cancelled' then raise exception 'Recipients can only cancel a ready claim'; end if;
      if v_is_donor and p_status <> 'picked_up' then raise exception 'Donors can only mark a ready claim picked up'; end if;
    elsif v_old_status='picked_up' then
      if not (v_is_donor or v_is_admin) or p_status <> 'completed' then raise exception 'Only the donor can complete a picked up claim'; end if;
    elsif v_old_status in ('cancelled','completed') then
      raise exception 'Claim is already closed';
    end if;

    if p_status='picked_up' then
      if not (v_is_donor or v_is_admin) then raise exception 'Only the donor can record pickup'; end if;
      if v_old_status <> 'ready_for_pickup' and not v_is_admin then raise exception 'The recipient must mark the claim ready for pickup first'; end if;
      if not v_is_admin and (nullif(trim(v_claim.pickup_code),'') is null or upper(trim(coalesce(p_pickup_code,''))) <> upper(trim(coalesce(v_claim.pickup_code,'')))) then
        raise exception 'Pickup code does not match';
      end if;
    end if;

    update public.claims
    set status=p_status,
        confirmed_at=case when p_status='confirmed' then coalesce(confirmed_at,now()) else confirmed_at end,
        ready_at=case when p_status='ready_for_pickup' then coalesce(ready_at,now()) else ready_at end,
        picked_up_at=case when p_status='picked_up' then coalesce(picked_up_at,now()) else picked_up_at end,
        completed_at=case when p_status='completed' then coalesce(completed_at,now()) else completed_at end,
        updated_at=now()
    where id=v_claim.id;

    if p_status='confirmed' and v_old_status='pending' then
      perform public.create_notification(v_claim.claimant_id,v_claim.id,'claim_confirmed','Claim accepted','Your claim for '||v_post.food_name||' was accepted by the donor. Your pickup code is '||v_claim.pickup_code||'.');
    elsif p_status='ready_for_pickup' then
      perform public.create_notification(v_post.donor_id,v_claim.id,'ready_for_pickup','Recipient is ready for pickup','The recipient marked the claim for '||v_post.food_name||' as ready for pickup. Ask for pickup code '||v_claim.pickup_code||' before handing over the food.');
    elsif p_status='picked_up' then
      perform public.create_notification(v_claim.claimant_id,v_claim.id,'picked_up','Pickup recorded','Pickup for '||v_post.food_name||' has been recorded by the donor.');
    elsif p_status='completed' then
      perform public.create_notification(v_claim.claimant_id,v_claim.id,'completed','Rescue completed','Your food rescue for '||v_post.food_name||' is complete.');
    end if;

    if p_status='completed' then
      update public.food_posts set status=case when remaining_quantity=0 then 'completed'::public.food_post_status when expiration_at<=now() then 'expired'::public.food_post_status else 'available'::public.food_post_status end,
        completed_at=case when remaining_quantity=0 then coalesce(completed_at,now()) else completed_at end,
        reserved_by=null,reservation_expires_at=null,updated_at=now() where id=v_post.id;
    elsif p_status='picked_up' then
      update public.food_posts set reservation_expires_at=null,updated_at=now() where id=v_post.id and status='reserved';
    end if;
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),'claim_status_updated','claim',p_claim_id,jsonb_build_object('from_status',v_old_status::text,'status',p_status::text));
end;
$$;

revoke all on function public.update_claim_status(uuid,public.claim_status,text) from public;
grant execute on function public.update_claim_status(uuid,public.claim_status,text) to authenticated;

-- ============================================================
-- REPUTATION
-- ============================================================
drop policy if exists reputation_insert on public.reputation_ratings;
drop policy if exists reputation_insert_none on public.reputation_ratings;
create policy reputation_insert_none on public.reputation_ratings
for insert to authenticated with check (false);

create or replace function public.submit_reputation_rating(
  p_claim_id uuid,
  p_rated_user_id uuid,
  p_rating smallint,
  p_feedback text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.claims%rowtype;
  v_post public.food_posts%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'Rating must be between 1 and 5'; end if;
  select * into v_claim from public.claims where id=p_claim_id;
  if not found then raise exception 'Claim not found'; end if;
  if v_claim.status <> 'completed' then raise exception 'You can only rate completed rescues'; end if;
  select * into v_post from public.food_posts where id=v_claim.food_post_id;

  if auth.uid() = v_claim.claimant_id and p_rated_user_id = v_post.donor_id then
    null;
  elsif auth.uid() = v_post.donor_id and p_rated_user_id = v_claim.claimant_id then
    null;
  else
    raise exception 'You can only rate the other participant in this completed rescue';
  end if;

  insert into public.reputation_ratings(claim_id,rater_id,rated_user_id,rating,feedback)
  values(v_claim.id,auth.uid(),p_rated_user_id,p_rating,left(nullif(trim(p_feedback),''),500))
  on conflict (claim_id,rater_id,rated_user_id)
  do update set rating=excluded.rating,feedback=excluded.feedback,created_at=now()
  returning id into v_id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),'reputation_rating_submitted','claim',p_claim_id,jsonb_build_object('rated_user_id',p_rated_user_id,'rating',p_rating));
  return v_id;
end;
$$;

revoke all on function public.submit_reputation_rating(uuid,uuid,smallint,text) from public;
grant execute on function public.submit_reputation_rating(uuid,uuid,smallint,text) to authenticated;

-- ============================================================
-- ACCOUNT CLOSURE / DATA CONTROL
-- ============================================================
-- Closure preserves transaction records for auditability while anonymizing
-- the user's profile and preventing further platform actions.
create or replace function public.close_my_account()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_claim public.claims%rowtype;
  v_post public.food_posts%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  perform 1 from public.profiles where id=v_uid for update;
  if not found then raise exception 'Your user profile could not be found'; end if;

  -- Lock food before its claims, as in the reservation/status functions.
  for v_post in
    select fp.* from public.food_posts fp
    where fp.donor_id=v_uid or exists (
      select 1 from public.claims c where c.food_post_id=fp.id and c.claimant_id=v_uid
        and c.status in ('pending','confirmed','ready_for_pickup','picked_up')
    )
    order by fp.id for update
  loop
    if exists(select 1 from public.claims c where c.food_post_id=v_post.id
      and c.status='picked_up' and (c.claimant_id=v_uid or v_post.donor_id=v_uid)) then
      raise exception 'Please complete your picked-up rescues before closing your account';
    end if;
    for v_claim in
      select c.* from public.claims c where c.food_post_id=v_post.id
        and c.status in ('pending','confirmed','ready_for_pickup')
        and (c.claimant_id=v_uid or v_post.donor_id=v_uid)
      for update
    loop
      update public.claims set status='cancelled',cancelled_at=now(),
        cancellation_reason='Account closed by participant',updated_at=now() where id=v_claim.id;
      update public.food_posts fp
      set remaining_quantity=remaining_quantity+v_claim.quantity,
          status=case when fp.expiration_at>now() then 'available'::public.food_post_status else 'expired'::public.food_post_status end,
          reserved_by=null,reservation_expires_at=null,updated_at=now()
      where fp.id=v_post.id and fp.status='reserved' and fp.reserved_by=v_claim.claimant_id;
      perform public.create_notification(
        case when v_post.donor_id=v_uid then v_claim.claimant_id else v_post.donor_id end,
        v_claim.id,'claim_cancelled','Claim cancelled',
        'The claim for '||v_post.food_name||' was cancelled because the other participant closed their account.'
      );
    end loop;
  end loop;

  update public.food_posts
  set status=case when expiration_at<=now() then 'expired'::public.food_post_status else 'cancelled'::public.food_post_status end,
      archived_at=coalesce(archived_at,now()),
      cancellation_reason='Account closed by owner',
      archived_by=null, reserved_by=null, reservation_expires_at=null,
      updated_at=now()
  where donor_id=v_uid and status in ('draft','available','reserved','claimed','picked_up');

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_uid,'account_closed','profile',v_uid,jsonb_build_object('reason','user_requested'));

  update public.profiles
  set full_name='Deleted user',
      phone=null,
      account_status='banned',
      verification_status='unverified',
      verification_notes='Account closed by user',
      closed_at=now(),
      updated_at=now()
  where id=v_uid;

  return found;
end;
$$;

revoke all on function public.close_my_account() from public;
grant execute on function public.close_my_account() to authenticated;

-- ============================================================
-- PUBLIC ANNOUNCEMENT READS / PROFILE RLS
-- ============================================================
-- Keep system settings admin-only. Public setting values are exposed through
-- behavior enforced in database functions/triggers, not by direct table reads.

-- ============================================================
-- ANALYTICS VIEW
-- ============================================================
create or replace view public.frss_admin_rescue_summary
with (security_invoker = true)
as
select
  (select count(*) from public.profiles) as total_users,
  (select count(*) from public.food_posts) as total_food_posts,
  (select count(*) from public.claims) as total_claims,
  (select count(*) from public.claims where status='completed') as completed_rescues,
  coalesce((select sum(quantity) from public.claims where status='completed'),0) as rescued_quantity,
  (select count(*) from public.food_posts where status='available') as available_food,
  (select count(*) from public.food_posts where status='expired') as expired_food,
  (select count(*) from public.claims where status in ('pending','confirmed','ready_for_pickup','picked_up')) as active_claims,
  (select count(*) from public.food_reports where status='open') as open_food_reports,
  (select count(*) from public.claim_reports where status in ('open','investigating')) as open_claim_reports;

create or replace function public.admin_rescue_analytics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select jsonb_build_object(
    'total_rescued_quantity', coalesce((select sum(quantity) from public.claims where status='completed'),0),
    'completed_rescues', (select count(*) from public.claims where status='completed'),
    'active_claims', (select count(*) from public.claims where status in ('pending','confirmed','ready_for_pickup','picked_up')),
    'total_claims', (select count(*) from public.claims),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day',d.day,'claims',coalesce(x.claims,0),'quantity',coalesce(x.quantity,0)) order by d.day)
      from generate_series(current_date - interval '29 days', current_date, interval '1 day') as d(day)
      left join (
        select date(completed_at) as day,count(*) as claims,coalesce(sum(quantity),0) as quantity
        from public.claims
        where status='completed' and completed_at >= current_date - interval '29 days'
        group by date(completed_at)
      ) x on x.day=d.day::date
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.admin_rescue_analytics() from public;
grant execute on function public.admin_rescue_analytics() to authenticated;

-- Admin-only access through security invoker + underlying RLS.
-- The admin dashboard also calculates the rolling 30-day activity through the RPC above.


-- Make automatic expiration honor the administrator's switch.
create or replace function public.expire_food_posts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_post public.food_posts%rowtype;
  v_claim public.claims%rowtype;
begin
  if not public.frss_setting_bool('auto_expire_enabled', true) then
    return 0;
  end if;

  for v_post in
    select * from public.food_posts
    where expiration_at <= now()
      and status in ('draft','available','reserved','claimed')
      and not exists(select 1 from public.claims c where c.food_post_id=food_posts.id and c.status='picked_up')
    for update skip locked
  loop
    if v_post.status='reserved' then
      select * into v_claim from public.claims
      where food_post_id=v_post.id and status in ('pending','confirmed','ready_for_pickup')
      order by claimed_at desc limit 1 for update;
      if v_claim.id is not null then
        update public.claims set status='cancelled',cancelled_at=now(),updated_at=now() where id=v_claim.id;
        perform public.create_notification(v_claim.claimant_id,v_claim.id,'food_expired','Food post expired','Your claim for '||v_post.food_name||' was cancelled because the food post expired.');
        perform public.create_notification(v_post.donor_id,v_claim.id,'food_expired','Food post expired',v_post.food_name||' has expired and the pending claim was cancelled.');
      end if;
    end if;
    update public.food_posts set status='expired',reserved_by=null,reservation_expires_at=null,updated_at=now() where id=v_post.id;
    insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
    values(null,'food_post_expired','food_post',v_post.id,jsonb_build_object('expiration_at',v_post.expiration_at));
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.expire_food_posts() from public;
grant execute on function public.expire_food_posts() to authenticated;

-- Honor the pickup grace setting for administrative no-show decisions.
create or replace function public.admin_no_show(p_claim_id uuid,p_reason text default 'Recipient did not arrive')
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_claim public.claims%rowtype;
  v_food public.food_posts%rowtype;
  v_grace integer;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into v_claim from public.claims where id=p_claim_id;
  if not found then raise exception 'Claim not found'; end if;
  select * into v_food from public.food_posts where id=v_claim.food_post_id for update;
  select * into v_claim from public.claims where id=p_claim_id for update;
  if v_food.status<>'reserved' or v_food.reserved_by is distinct from v_claim.claimant_id then raise exception 'This food is no longer reserved by this recipient'; end if;
  if v_claim.status not in ('confirmed','ready_for_pickup') then raise exception 'Only an active pickup can be marked as a no-show'; end if;
  v_grace:=greatest(0,floor(public.frss_setting_number('pickup_grace_minutes',60))::integer);
  if coalesce(v_claim.ready_at,v_claim.confirmed_at) is not null
     and now() < coalesce(v_claim.ready_at,v_claim.confirmed_at) + make_interval(mins=>v_grace) then
    raise exception 'Pickup grace period has not elapsed yet';
  end if;
  select * into v_food from public.food_posts where id=v_claim.food_post_id for update;
  update public.claims set status='cancelled',no_show_at=now(),no_show_by=auth.uid(),issue_status='resolved',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=p_reason,updated_at=now() where id=p_claim_id;
  update public.food_posts set remaining_quantity=remaining_quantity+v_claim.quantity,status=case when expiration_at<=now() then 'expired'::public.food_post_status else 'available'::public.food_post_status end,reserved_by=null,reservation_expires_at=null,updated_at=now() where id=v_food.id;
  perform public.create_notification(v_claim.claimant_id,v_claim.id,'claim_declined','Pickup marked as no-show','The claim for '||v_food.food_name||' was closed as a no-show.');
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'no_show_reported','claim',p_claim_id,jsonb_build_object('reason',p_reason,'quantity_released',v_claim.quantity));
  return true;
end;
$$;

revoke all on function public.admin_no_show(uuid,text) from public;
grant execute on function public.admin_no_show(uuid,text) to authenticated;

-- Validate system settings before saving them.
create or replace function public.admin_update_setting(p_key text,p_value jsonb)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_num numeric;
  v_bool boolean;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;

  if p_key in ('pickup_grace_minutes','max_claims_per_user') then
    if jsonb_typeof(p_value) not in ('number','string') then raise exception 'Setting % must be numeric',p_key; end if;
    v_num:=nullif(p_value #>> '{}','')::numeric;
    if p_key='pickup_grace_minutes' and (v_num is null or v_num<0 or v_num>10080) then raise exception 'Pickup grace must be between 0 and 10080 minutes'; end if;
    if p_key='max_claims_per_user' and (v_num is null or v_num<1 or v_num>1000 or v_num<>floor(v_num)) then raise exception 'Maximum active claims must be a whole number between 1 and 1000'; end if;
  elsif p_key in ('auto_expire_enabled','require_food_moderation') then
    if jsonb_typeof(p_value)='boolean' then v_bool=(p_value #>> '{}')::boolean;
    elsif jsonb_typeof(p_value)='string' then v_bool=lower(p_value #>> '{}') in ('true','false');
    else raise exception 'Setting % must be boolean',p_key; end if;
  else
    raise exception 'Unknown system setting';
  end if;

  insert into public.system_settings(key,value,updated_by,updated_at)
  values(p_key,p_value,auth.uid(),now())
  on conflict(key) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now();
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),'system_setting_changed','system_setting',null,jsonb_build_object('key',p_key,'value',p_value));
  return true;
end;
$$;

revoke all on function public.admin_update_setting(text,jsonb) from public;
grant execute on function public.admin_update_setting(text,jsonb) to authenticated;

-- ================================================================
-- COMPATIBILITY: supabase-food-images-3.sql backfill
-- ================================================================
-- Keep the first legacy image_url in image_urls for older records.
update public.food_posts
set image_urls = jsonb_build_array(image_url)
where image_url is not null
  and image_url <> ''
  and image_urls = '[]'::jsonb;

-- ================================================================
-- SECTION 10: IDENTITY VERIFICATION (ID + SELFIE)
-- ================================================================
-- Identity verification is required for both donors and recipients before
-- donating or claiming food. Government ID and selfie files are private.

create table if not exists public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  id_type text not null check (char_length(trim(id_type)) between 2 and 80),
  id_document_path text not null,
  selfie_path text not null,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  admin_notes text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_identity_verifications_user on public.identity_verifications(user_id, created_at desc);
create index if not exists idx_identity_verifications_status on public.identity_verifications(status, submitted_at desc);

alter table public.identity_verifications enable row level security;

drop policy if exists identity_verifications_select_own on public.identity_verifications;
create policy identity_verifications_select_own on public.identity_verifications
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists identity_verifications_insert_own on public.identity_verifications;

create policy identity_verifications_insert_own on public.identity_verifications
for insert to authenticated
with check (user_id = auth.uid());

-- Private bucket for government IDs and selfies. Do not make this bucket public.
insert into storage.buckets (id, name, public)
values ('identity-verification', 'identity-verification', false)
on conflict (id) do update set public = false;

drop policy if exists "identity verification upload own folder" on storage.objects;
create policy "identity verification upload own folder" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'identity-verification'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "identity verification read own or admin" on storage.objects;
create policy "identity verification read own or admin" on storage.objects
for select to authenticated
using (
  bucket_id = 'identity-verification'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists "identity verification update own folder" on storage.objects;
create policy "identity verification update own folder" on storage.objects
for update to authenticated
using (
  bucket_id = 'identity-verification'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'identity-verification'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "identity verification delete own folder" on storage.objects;
create policy "identity verification delete own folder" on storage.objects
for delete to authenticated
using (
  bucket_id = 'identity-verification'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.submit_identity_verification(
  p_id_type text,
  p_id_document_path text,
  p_selfie_path text
)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_profile from public.profiles where id=v_uid for update;
  if not found or v_profile.account_status <> 'active' then raise exception 'Your account is not active'; end if;
  if v_profile.verification_status='verified' then raise exception 'Your identity is already verified'; end if;
  if v_profile.verification_status='pending' or exists(select 1 from public.identity_verifications where user_id=v_uid and status='pending') then
    raise exception 'A verification submission is already under review';
  end if;
  if trim(coalesce(p_id_type,'')) = '' then raise exception 'ID type is required'; end if;
  if p_id_document_path is null or p_selfie_path is null then raise exception 'ID and selfie are required'; end if;
  if split_part(p_id_document_path,'/',1) <> v_uid::text or split_part(p_selfie_path,'/',1) <> v_uid::text then
    raise exception 'Invalid verification file path';
  end if;

  if not exists(select 1 from storage.objects where bucket_id='identity-verification' and name=p_id_document_path)
     or not exists(select 1 from storage.objects where bucket_id='identity-verification' and name=p_selfie_path) then
    raise exception 'Verification images could not be found';
  end if;

  insert into public.identity_verifications(user_id,id_type,id_document_path,selfie_path,status,submitted_at,updated_at)
  values(v_uid,trim(p_id_type),p_id_document_path,p_selfie_path,'pending',now(),now())
  returning id into v_id;

  update public.profiles
  set verification_status='pending', verification_notes=null, updated_at=now()
  where id=v_uid;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_uid,'identity_verification_submitted','identity_verification',v_id,jsonb_build_object('id_type',trim(p_id_type)));

  return v_id;
end; $$;

create or replace function public.admin_review_identity_verification(
  p_verification_id uuid,
  p_status text,
  p_notes text default null
)
returns boolean language plpgsql security definer set search_path=public as $$
declare
  v_user_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_status is null or p_status not in ('verified','rejected') then raise exception 'Review status must be verified or rejected'; end if;

  select user_id into v_user_id from public.identity_verifications where id=p_verification_id;
  if v_user_id is null then raise exception 'Verification submission not found'; end if;
  perform 1 from public.profiles where id=v_user_id for update;
  perform 1 from public.identity_verifications where id=p_verification_id and status='pending' for update;
  if not found then raise exception 'This submission has already been reviewed'; end if;
  if p_verification_id is distinct from (
    select id from public.identity_verifications where user_id=v_user_id order by created_at desc,id desc limit 1
  ) then raise exception 'Please review the latest identity submission'; end if;

  update public.identity_verifications
  set status=p_status, admin_notes=p_notes, reviewed_at=now(), reviewed_by=auth.uid(), updated_at=now()
  where id=p_verification_id;

  update public.profiles
  set verification_status=p_status,
      verification_notes=p_notes,
      updated_at=now()
  where id=v_user_id;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),'identity_verification_reviewed','identity_verification',p_verification_id,
         jsonb_build_object('user_id',v_user_id,'status',p_status,'notes',p_notes));

  return found;
end; $$;

revoke all on function public.submit_identity_verification(text,text,text) from public;
grant execute on function public.submit_identity_verification(text,text,text) to authenticated;
revoke all on function public.admin_review_identity_verification(uuid,text,text) from public;
grant execute on function public.admin_review_identity_verification(uuid,text,text) to authenticated;

-- Audit fixes: active admin permissions and reserved-post visibility.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and account_status = 'active'
  );
$$;
drop policy if exists food_posts_select on public.food_posts;
create policy food_posts_select on public.food_posts
for select to anon, authenticated
using (
  ((status='reserved' or (status='available' and remaining_quantity>0))
   and expiration_at>now() and moderation_status='approved' and archived_at is null)
  or donor_id=auth.uid() or public.has_claim_for_food_post(id) or public.is_admin()
);

-- New verification submissions must use the validated RPC.
drop policy if exists identity_verifications_insert_own on public.identity_verifications;

-- ================================================================
-- FINAL SECURITY HARDENING
-- ================================================================
-- Supabase projects can grant EXECUTE on newly created public-schema
-- functions to API roles through default privileges. Reset those grants after
-- every function has been created, then expose only the RPCs used by FRSS.
revoke execute on all functions in schema public from public, anon, authenticated;

-- Keep public listing policies independent from signed-in helper functions.
drop policy if exists categories_select_active on public.categories;
drop policy if exists categories_select_active_authenticated on public.categories;
create policy categories_select_active on public.categories
for select to anon
using (is_active = true);
create policy categories_select_active_authenticated on public.categories
for select to authenticated
using (is_active = true or public.is_admin());

drop policy if exists food_posts_select on public.food_posts;
drop policy if exists food_posts_select_public on public.food_posts;
drop policy if exists food_posts_select_authenticated on public.food_posts;
create policy food_posts_select_public on public.food_posts
for select to anon
using (
  (status = 'reserved' or (status = 'available' and remaining_quantity > 0))
  and expiration_at > now()
  and moderation_status = 'approved'
  and archived_at is null
);
create policy food_posts_select_authenticated on public.food_posts
for select to authenticated
using (
  ((status = 'reserved' or (status = 'available' and remaining_quantity > 0))
   and expiration_at > now() and moderation_status = 'approved' and archived_at is null)
  or donor_id = auth.uid()
  or public.has_claim_for_food_post(id)
  or public.is_admin()
);

-- Read-only helpers used by signed-in RLS policies.
grant execute on function public.has_claim_for_food_post(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Signed-in application RPCs.
grant execute on function public.admin_archive_food(uuid,text) to authenticated;
grant execute on function public.admin_moderate_food(uuid,text,text) to authenticated;
grant execute on function public.admin_no_show(uuid,text) to authenticated;
grant execute on function public.admin_rescue_analytics() to authenticated;
grant execute on function public.admin_resolve_claim_report(uuid,text,text) to authenticated;
grant execute on function public.admin_review_identity_verification(uuid,text,text) to authenticated;
grant execute on function public.admin_set_user_status(uuid,text,text) to authenticated;
grant execute on function public.admin_set_verification(uuid,text,text) to authenticated;
grant execute on function public.admin_update_case(uuid,text,text,uuid) to authenticated;
grant execute on function public.admin_update_setting(text,jsonb) to authenticated;
grant execute on function public.claim_food(uuid,numeric) to authenticated;
grant execute on function public.close_my_account() to authenticated;
grant execute on function public.expire_food_posts() to authenticated;
grant execute on function public.frss_setting_bool(text,boolean) to authenticated;
grant execute on function public.frss_setting_number(text,numeric) to authenticated;
grant execute on function public.release_expired_reservations() to authenticated;
grant execute on function public.submit_identity_verification(text,text,text) to authenticated;
grant execute on function public.submit_reputation_rating(uuid,uuid,smallint,text) to authenticated;
grant execute on function public.update_claim_status(uuid,public.claim_status,text) to authenticated;
grant execute on function public.update_my_profile(text,text) to authenticated;

-- Pin trigger helper lookup paths to prevent object-shadowing attacks.
alter function public.set_updated_at() set search_path = public;
alter function public.set_food_report_updated_at() set search_path = public;
