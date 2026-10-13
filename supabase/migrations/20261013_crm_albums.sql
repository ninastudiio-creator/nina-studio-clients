-- CRM, phase 1: album clients, orders, leads, timeline.

-- Clients: shared by albums and websites. `lines` says which business a client belongs to.
alter table public.clients
  add column if not exists lines text[] not null default '{website}',
  add column if not exists address text not null default '',
  add column if not exists source text not null default '',
  add column if not exists notes text not null default '',
  add column if not exists needs_review boolean not null default false,
  add column if not exists phone_norm text generated always as (
    nullif(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9), '')
  ) stored;
create index if not exists clients_phone_norm_idx on public.clients (phone_norm);

-- Stages (one list for all products; each product uses a subset).
create table if not exists public.stages (
  key text primary key,
  label text not null,
  owner text not null check (owner in ('client', 'me', 'neutral', 'done')),
  position int not null,
  late_days int,
  products text[] not null
);

insert into public.stages (key, label, owner, position, late_days, products) values
  ('awaiting_payment',  'מחכה לתשלום',  'client',  10, 3,    '{personal_classic,personal_premium,wedding,template}'),
  ('awaiting_materials','ממתין לחומרים', 'client',  20, 7,    '{personal_classic,personal_premium,wedding,template}'),
  ('awaiting_design',   'ממתין לעיצוב',  'me',      30, 7,    '{personal_classic,personal_premium,wedding}'),
  ('designing',         'בעיצוב',        'me',      40, 7,    '{personal_classic,personal_premium,wedding}'),
  ('sent_to_client',    'נשלח ללקוחה',   'client',  50, 4,    '{personal_classic,personal_premium,wedding}'),
  ('revisions',         'סבב תיקונים',   'me',      60, 3,    '{personal_classic,personal_premium,wedding}'),
  ('awaiting_review',   'ממתין לבדיקה',  'me',      70, 2,    '{template}'),
  ('awaiting_print',    'ממתין להדפסה',  'me',      80, 2,    '{personal_classic,personal_premium,wedding,template}'),
  ('printing',          'בדפוס',         'neutral', 90, 14,   '{personal_classic,personal_premium,wedding,template}'),
  ('awaiting_shipping', 'ממתין למשלוח',  'me',     100, 3,    '{personal_classic,personal_premium,wedding,template}'),
  ('shipping',          'במשלוח',        'neutral',110, 4,    '{personal_classic,personal_premium,wedding,template}'),
  ('closed',            'סגור',          'done',   120, null, '{personal_classic,personal_premium,wedding,template}')
on conflict (key) do update set label = excluded.label, owner = excluded.owner, position = excluded.position,
  late_days = excluded.late_days, products = excluded.products;

-- Album orders.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  product text check (product in ('personal_classic', 'personal_premium', 'wedding', 'template', 'other')),
  product_name text not null default '',        -- e.g. "טמפלט יפן"
  topic text not null default '',               -- album subject from Wix custom text
  size text not null default '',
  pages int,
  ordered_at date,
  stage text not null default 'awaiting_materials' references public.stages (key),
  stage_since timestamptz not null default now(),
  flag text check (flag in ('repair', 'hold')),
  delivery text check (delivery in ('direct', 'via_me', 'pickup')),
  address text not null default '',
  -- money
  price numeric(10, 2),                         -- what the client paid, incl. VAT
  vat_rate numeric(4, 3) not null default 0.18, -- 0 for years without VAT
  paid_via text not null default '',
  receipt boolean not null default false,
  print_cost numeric(10, 2),                    -- printing cost, excl. VAT
  print_paid boolean not null default false,
  shipping_cost numeric(10, 2) not null default 0,
  profit numeric(10, 2) generated always as (
    coalesce(price, 0) / (1 + vat_rate) - coalesce(print_cost, 0) - shipping_cost
  ) stored,
  -- links
  wix_order_number text unique,
  diprint_order_number text,
  drive_folder_url text not null default '',
  notes text not null default '',
  -- import
  legacy_ref text unique,                       -- e.g. "2025!45" (sheet tab + row)
  legacy jsonb,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_client_idx on public.orders (client_id);
create index if not exists orders_stage_idx on public.orders (stage);

-- Leads.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete set null,
  name text not null default '',
  phone text not null default '',
  source text not null default '' check (source in ('', 'whatsapp', 'wix_cart', 'wix_form', 'instagram', 'referral', 'past_client', 'other')),
  interest text not null default '',
  stage text not null default 'new' check (stage in ('new', 'talking', 'offer_sent', 'won', 'lost')),
  stage_since timestamptz not null default now(),
  last_contact_at timestamptz,
  lost_reason text not null default '',
  converted_order_id uuid references public.orders (id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- Timeline: everything that happened to a client / order / lead.
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete cascade,
  order_id uuid references public.orders (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  type text not null,          -- stage_change, whatsapp_out, whatsapp_in, note, payment, email, import
  text text not null default '',
  data jsonb not null default '{}',
  actor text not null default 'hagar' check (actor in ('hagar', 'agent', 'system')),
  created_at timestamptz not null default now()
);
create index if not exists events_client_idx on public.events (client_id, created_at desc);
create index if not exists events_order_idx on public.events (order_id, created_at desc);

-- Keep updated_at / stage_since current, and log stage changes.
create or replace function public.orders_touch() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    new.stage_since := now();
    insert into public.events (client_id, order_id, type, text, data, actor)
    values (new.client_id, new.id, 'stage_change',
            (select label from public.stages where key = new.stage),
            jsonb_build_object('from', old.stage, 'to', new.stage),
            coalesce(nullif(current_setting('app.actor', true), ''), 'hagar'));
  end if;
  return new;
end $$;
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before insert or update on public.orders
  for each row execute function public.orders_touch();

-- Same access model as the rest of the app: the logged-in admin can do everything.
alter table public.stages enable row level security;
alter table public.orders enable row level security;
alter table public.leads enable row level security;
alter table public.events enable row level security;
drop policy if exists "authenticated full access stages" on public.stages;
create policy "authenticated full access stages" on public.stages for all to authenticated using (true) with check (true);
drop policy if exists "authenticated full access orders" on public.orders;
create policy "authenticated full access orders" on public.orders for all to authenticated using (true) with check (true);
drop policy if exists "authenticated full access leads" on public.leads;
create policy "authenticated full access leads" on public.leads for all to authenticated using (true) with check (true);
drop policy if exists "authenticated full access events" on public.events;
create policy "authenticated full access events" on public.events for all to authenticated using (true) with check (true);
