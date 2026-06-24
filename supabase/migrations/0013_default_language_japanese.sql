alter table public.settings
  alter column default_language set default 'JP';

update public.settings
set default_language = 'JP'
where default_language = 'EN';

notify pgrst, 'reload schema';
