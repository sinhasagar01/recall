-- A setup screen needs counts scoped to exactly one practice shape. The library
-- count RPC intentionally keeps its category options global, so it cannot answer
-- this question without making its own toolbar counts misleading.
create function public.practice_setup_counts(p_kind text)
  returns jsonb
  language sql
  stable
  security invoker
  parallel safe
  set search_path = ''
as $$
  with selected as (
    select coalesce(category, 'Uncategorized') as category, confidence
    from public.topics
    where kind = p_kind
  ), by_category as (
    select
      category,
      count(*)::int as count,
      count(*) filter (where confidence in ('new', 'weak'))::int as "needsPractice"
    from selected
    group by category
  )
  select jsonb_build_object(
    'total', (select count(*)::int from selected),
    'needsPractice', (select count(*) filter (where confidence in ('new', 'weak'))::int from selected),
    'byCategory', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'category', category,
        'count', count,
        'needsPractice', "needsPractice"
      ) order by category) from by_category),
      '[]'::jsonb
    )
  )
$$;

grant execute on function public.practice_setup_counts(text) to authenticated;
