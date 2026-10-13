-- Why a row was flagged during the sheet import, shown in the CRM review list.
alter table public.orders add column if not exists review_note text not null default '';
alter table public.clients add column if not exists review_note text not null default '';
-- Imported orders: stage started at the order date (the sheet has no stage dates).
update public.orders set stage_since = ordered_at::timestamptz where legacy_ref is not null and ordered_at is not null;
