-- Hesabdar 09.4 SAFE — run once in the correct Supabase project.
-- Keeps existing data. Creates one isolated store per account and enforces RLS.

create extension if not exists pgcrypto;

alter table public.store_users add column if not exists active boolean not null default true;
alter table public.store_users add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table public.store_users add column if not exists role text not null default 'staff';
create unique index if not exists store_users_store_email_uq
  on public.store_users(store_id, lower(user_email));

create or replace function public.jwt_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt()->>'email',''));
$$;

create or replace function public.is_store_member(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.store_users su
    where su.store_id=p_store_id
      and lower(su.user_email)=public.jwt_email()
      and coalesce(su.active,true)=true
  ) or exists(
    select 1 from public.stores s
    where s.id=p_store_id
      and lower(coalesce(s.owner_email,''))=public.jwt_email()
  );
$$;

create or replace function public.is_store_owner(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.stores s
    where s.id=p_store_id
      and lower(coalesce(s.owner_email,''))=public.jwt_email()
  ) or exists(
    select 1 from public.store_users su
    where su.store_id=p_store_id
      and lower(su.user_email)=public.jwt_email()
      and su.role in ('owner','admin')
      and coalesce(su.active,true)=true
  );
$$;

create or replace function public.ensure_my_store()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_email text:=public.jwt_email();
  v_store public.stores%rowtype;
  v_member public.store_users%rowtype;
  v_store_id uuid;
  v_name text;
begin
  if auth.uid() is null or v_email='' then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_member
  from public.store_users
  where lower(user_email)=v_email and coalesce(active,true)=true
  order by case when role='owner' then 0 else 1 end, created_at
  limit 1;

  if found then
    select * into v_store from public.stores where id=v_member.store_id;
    if found then
      return jsonb_build_object(
        'id',v_store.id,'name',v_store.name,'owner_email',v_store.owner_email,
        'role',coalesce(v_member.role,'staff'),'permissions',coalesce(v_member.permissions,'{}'::jsonb)
      );
    end if;
  end if;

  select * into v_store
  from public.stores
  where lower(coalesce(owner_email,''))=v_email
  order by id
  limit 1;

  if found then
    insert into public.store_users(store_id,user_email,role,active,permissions)
    values(v_store.id,v_email,'owner',true,'{}'::jsonb)
    on conflict do nothing;
    update public.store_users set role='owner',active=true
      where store_id=v_store.id and lower(user_email)=v_email;
    return jsonb_build_object('id',v_store.id,'name',v_store.name,'owner_email',v_store.owner_email,'role','owner','permissions','{}'::jsonb);
  end if;

  v_store_id:=gen_random_uuid();
  v_name:=coalesce(nullif(auth.jwt()->'user_metadata'->>'store_name',''),'فروشگاه من');
  insert into public.stores(id,name,owner_email)
  values(v_store_id,v_name,v_email)
  returning * into v_store;

  insert into public.store_users(store_id,user_email,role,active,permissions)
  values(v_store_id,v_email,'owner',true,'{}'::jsonb)
  on conflict do nothing;

  return jsonb_build_object('id',v_store.id,'name',v_store.name,'owner_email',v_store.owner_email,'role','owner','permissions','{}'::jsonb);
end;
$$;

grant execute on function public.ensure_my_store() to authenticated;
grant execute on function public.is_store_member(uuid) to authenticated;
grant execute on function public.is_store_owner(uuid) to authenticated;

alter table public.stores enable row level security;
alter table public.store_users enable row level security;
alter table public.customers enable row level security;
alter table public.transactions enable row level security;

-- Remove old policies so permissive legacy rules cannot leak data.
do $$ declare r record; begin
  for r in select policyname,tablename from pg_policies where schemaname='public' and tablename in ('stores','store_users','customers','transactions') loop
    execute format('drop policy if exists %I on public.%I',r.policyname,r.tablename);
  end loop;
end $$;

create policy stores_select_member on public.stores for select to authenticated
using(public.is_store_member(id));
create policy stores_update_owner on public.stores for update to authenticated
using(public.is_store_owner(id)) with check(public.is_store_owner(id));

create policy store_users_select on public.store_users for select to authenticated
using(lower(user_email)=public.jwt_email() or public.is_store_owner(store_id));
create policy store_users_insert_owner on public.store_users for insert to authenticated
with check(public.is_store_owner(store_id));
create policy store_users_update_owner on public.store_users for update to authenticated
using(public.is_store_owner(store_id)) with check(public.is_store_owner(store_id));
create policy store_users_delete_owner on public.store_users for delete to authenticated
using(public.is_store_owner(store_id));

create policy customers_select_member on public.customers for select to authenticated
using(public.is_store_member(store_id));
create policy customers_insert_member on public.customers for insert to authenticated
with check(public.is_store_member(store_id));
create policy customers_update_member on public.customers for update to authenticated
using(public.is_store_member(store_id)) with check(public.is_store_member(store_id));
create policy customers_delete_owner on public.customers for delete to authenticated
using(public.is_store_owner(store_id));

create policy transactions_select_member on public.transactions for select to authenticated
using(public.is_store_member(store_id));
create policy transactions_insert_member on public.transactions for insert to authenticated
with check(public.is_store_member(store_id));
create policy transactions_update_member on public.transactions for update to authenticated
using(public.is_store_member(store_id)) with check(public.is_store_member(store_id));
create policy transactions_delete_owner on public.transactions for delete to authenticated
using(public.is_store_owner(store_id));

grant select,insert,update,delete on public.stores,public.store_users,public.customers,public.transactions to authenticated;
notify pgrst,'reload schema';
