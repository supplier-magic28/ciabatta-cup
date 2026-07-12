-- Enum additions must commit before a later migration can safely use the value.
alter type public.match_type add value if not exists 'unranked_external';
