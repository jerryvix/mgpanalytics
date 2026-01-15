-- Rename columns to match the requested naming convention
ALTER TABLE public.games RENAME COLUMN home_team TO home_team_name;
ALTER TABLE public.games RENAME COLUMN visitor_team TO visitor_team_name;
ALTER TABLE public.games RENAME COLUMN start_time TO date;