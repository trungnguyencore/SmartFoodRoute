-- Add a first-class drink category without rewriting existing food rows.
alter type public.place_category add value if not exists 'drink';
