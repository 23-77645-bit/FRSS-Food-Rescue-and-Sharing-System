-- FRSS bug fixes for an EXISTING FRSS database.
-- Includes the identity-verification table and private storage setup if missing.
-- Run this file once in Supabase SQL Editor before using the updated website.
-- This patch does not delete existing rows or recreate tables.
begin;

-- Bootstrap identity verification for databases that have not installed it yet.
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


-- Reviews/submissions write through SECURITY DEFINER RPCs.
grant select on public.identity_verifications to authenticated;
revoke insert, update, delete on public.identity_verifications from anon, authenticated;

select setval(
  'public.profile_number_seq',
  greatest(1, coalesce((select max(profile_number) from public.profiles), 0),
    (select last_value from public.profile_number_seq)),
  (select is_called from public.profile_number_seq) or exists(select 1 from public.profiles)
);
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
create or replace function public.claim_food(
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
drop policy if exists food_posts_select on public.food_posts;
create policy food_posts_select on public.food_posts
for select to anon, authenticated
using (
  ((status='reserved' or (status='available' and remaining_quantity>0))
   and expiration_at>now() and moderation_status='approved' and archived_at is null)
  or donor_id=auth.uid() or public.has_claim_for_food_post(id) or public.is_admin()
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

-- New verification submissions must use the validated RPC.
drop policy if exists identity_verifications_insert_own on public.identity_verifications;

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
commit;
