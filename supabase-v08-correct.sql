-- حسابدار v0.8 درست: مدیریت کارکنان و دسترسی‌ها
alter table public.store_users add column if not exists active boolean not null default true;
alter table public.store_users add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table public.store_users add column if not exists role text not null default 'staff';
create unique index if not exists store_users_store_email_uq on public.store_users(store_id,user_email);
notify pgrst, 'reload schema';
