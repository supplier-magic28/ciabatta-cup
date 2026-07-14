-- Enum expansion commits separately because PostgreSQL does not allow a new
-- enum value to be referenced elsewhere in the transaction that creates it.
alter type public.tournament_ruleset add value if not exists 'pro_set_8';
alter type public.tournament_ruleset add value if not exists 'best_of_3_standard';
