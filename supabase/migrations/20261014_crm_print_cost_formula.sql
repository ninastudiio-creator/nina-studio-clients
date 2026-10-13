-- Printing cost follows the sheet's formula from the page count (before VAT):
--   127.14 + (pages/2 - 20) * 2.97
-- print_cost is now an override; when it is empty the formula is used.
alter table public.orders add column if not exists print_cost_auto numeric(10, 2)
  generated always as (case when pages is not null then round(127.14 + (pages / 2.0 - 20) * 2.97, 2) end) stored;

alter table public.orders drop column if exists profit;
alter table public.orders add column profit numeric(10, 2) generated always as (
  case
    when price is null then null
    when coalesce(print_cost, case when pages is not null then 127.14 + (pages / 2.0 - 20) * 2.97 end) is null then null
    else price / (1 + vat_rate)
         - coalesce(print_cost, 127.14 + (pages / 2.0 - 20) * 2.97)
         - shipping_cost
  end
) stored;

-- 2026 sheet rows: the stored cost was just the formula's result, so let the formula own it.
update public.orders set print_cost = null
where legacy_ref like '2026%' and print_cost is not null and pages is not null
  and abs(print_cost - (127.14 + (pages / 2.0 - 20) * 2.97)) < 0.06;

-- The sheet ran the formula on an empty page count (= 67.74), which isn't a real cost.
update public.orders set print_cost = null
where legacy_ref like '2026%' and pages is null and abs(print_cost - 67.74) < 0.06;
