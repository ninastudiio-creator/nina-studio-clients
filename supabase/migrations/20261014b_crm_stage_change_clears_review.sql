-- Any real stage change answers the import's stage questions ("בלי סטטוס", "בדפוס יותר מחודש").
-- Duplicates, refunds and a missing product still need a look.
create or replace function public.orders_touch() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    new.stage_since := now();
    if new.needs_review and new.review_note !~ '(לאחד|החזר|בלי מוצר)' then
      new.needs_review := false;
    end if;
    insert into public.events (client_id, order_id, type, text, data, actor)
    values (new.client_id, new.id, 'stage_change',
            (select label from public.stages where key = new.stage),
            jsonb_build_object('from', old.stage, 'to', new.stage),
            coalesce(nullif(current_setting('app.actor', true), ''), 'hagar'));
  end if;
  return new;
end $$;

update public.orders set needs_review = false
where needs_review and stage = 'closed' and review_note !~ '(לאחד|החזר)';

update public.orders o set needs_review = false
where o.needs_review and o.review_note !~ '(לאחד|החזר|בלי מוצר)'
  and exists (select 1 from public.events e where e.order_id = o.id and e.type = 'stage_change');
