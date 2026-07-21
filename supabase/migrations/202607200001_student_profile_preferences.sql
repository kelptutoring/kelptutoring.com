-- Phase 1: Student Profile, governed profile choices, and synchronized preferences.

create table if not exists public.profile_locations (
  location_key text primary key,
  country_code text not null,
  country_name text not null,
  region_code text not null,
  region_name text not null,
  city_name text not null,
  time_zone text not null,
  provider text not null default 'kelp',
  provider_reference text not null default '',
  source_revision text not null default '',
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_locations_key_check check (location_key ~ '^[a-z0-9][a-z0-9._:-]{1,159}$'),
  constraint profile_locations_country_code_check check (country_code ~ '^[A-Z]{2}$'),
  constraint profile_locations_country_name_check check (btrim(country_name) <> '' and char_length(country_name) <= 120),
  constraint profile_locations_region_code_check check (btrim(region_code) <> '' and char_length(region_code) <= 40),
  constraint profile_locations_region_name_check check (btrim(region_name) <> '' and char_length(region_name) <= 160),
  constraint profile_locations_city_name_check check (btrim(city_name) <> '' and char_length(city_name) <= 160),
  constraint profile_locations_time_zone_check check (btrim(time_zone) <> '' and char_length(time_zone) <= 100),
  constraint profile_locations_unique_place unique (country_code, region_code, city_name)
);

create index if not exists profile_locations_picker_idx
on public.profile_locations (active, country_name, region_name, city_name, location_key);

comment on table public.profile_locations is
  'Governed country/region/city choices. Production catalog imports are deployment data, not browser-authored profile values.';

insert into public.profile_locations (
  location_key, country_code, country_name, region_code, region_name, city_name,
  time_zone, provider, provider_reference, source_revision, sort_order
)
values
  ('kelp:br:sp:sao-paulo', 'BR', 'Brazil', 'SP', 'Sao Paulo', 'Sao Paulo', 'America/Sao_Paulo', 'kelp', 'BR-SP-SAO_PAULO', 'starter-v1', 10),
  ('kelp:br:rj:rio-de-janeiro', 'BR', 'Brazil', 'RJ', 'Rio de Janeiro', 'Rio de Janeiro', 'America/Sao_Paulo', 'kelp', 'BR-RJ-RIO_DE_JANEIRO', 'starter-v1', 20),
  ('kelp:br:mg:belo-horizonte', 'BR', 'Brazil', 'MG', 'Minas Gerais', 'Belo Horizonte', 'America/Sao_Paulo', 'kelp', 'BR-MG-BELO_HORIZONTE', 'starter-v1', 30),
  ('kelp:ar:c:buenos-aires', 'AR', 'Argentina', 'C', 'Buenos Aires', 'Buenos Aires', 'America/Argentina/Buenos_Aires', 'kelp', 'AR-C-BUENOS_AIRES', 'starter-v1', 40),
  ('kelp:ca:on:toronto', 'CA', 'Canada', 'ON', 'Ontario', 'Toronto', 'America/Toronto', 'kelp', 'CA-ON-TORONTO', 'starter-v1', 50),
  ('kelp:mx:cmx:mexico-city', 'MX', 'Mexico', 'CMX', 'Ciudad de Mexico', 'Mexico City', 'America/Mexico_City', 'kelp', 'MX-CMX-MEXICO_CITY', 'starter-v1', 60),
  ('kelp:us:ca:los-angeles', 'US', 'United States', 'CA', 'California', 'Los Angeles', 'America/Los_Angeles', 'kelp', 'US-CA-LOS_ANGELES', 'starter-v1', 70),
  ('kelp:us:ca:san-francisco', 'US', 'United States', 'CA', 'California', 'San Francisco', 'America/Los_Angeles', 'kelp', 'US-CA-SAN_FRANCISCO', 'starter-v1', 80),
  ('kelp:us:ny:new-york', 'US', 'United States', 'NY', 'New York', 'New York', 'America/New_York', 'kelp', 'US-NY-NEW_YORK', 'starter-v1', 90),
  ('kelp:us:tx:austin', 'US', 'United States', 'TX', 'Texas', 'Austin', 'America/Chicago', 'kelp', 'US-TX-AUSTIN', 'starter-v1', 100),
  ('kelp:gb:eng:london', 'GB', 'United Kingdom', 'ENG', 'England', 'London', 'Europe/London', 'kelp', 'GB-ENG-LONDON', 'starter-v1', 110),
  ('kelp:pt:11:lisbon', 'PT', 'Portugal', '11', 'Lisbon', 'Lisbon', 'Europe/Lisbon', 'kelp', 'PT-11-LISBON', 'starter-v1', 120),
  ('kelp:es:md:madrid', 'ES', 'Spain', 'MD', 'Community of Madrid', 'Madrid', 'Europe/Madrid', 'kelp', 'ES-MD-MADRID', 'starter-v1', 130),
  ('kelp:fr:idf:paris', 'FR', 'France', 'IDF', 'Ile-de-France', 'Paris', 'Europe/Paris', 'kelp', 'FR-IDF-PARIS', 'starter-v1', 140),
  ('kelp:de:be:berlin', 'DE', 'Germany', 'BE', 'Berlin', 'Berlin', 'Europe/Berlin', 'kelp', 'DE-BE-BERLIN', 'starter-v1', 150),
  ('kelp:in:dl:new-delhi', 'IN', 'India', 'DL', 'Delhi', 'New Delhi', 'Asia/Kolkata', 'kelp', 'IN-DL-NEW_DELHI', 'starter-v1', 160),
  ('kelp:jp:13:tokyo', 'JP', 'Japan', '13', 'Tokyo', 'Tokyo', 'Asia/Tokyo', 'kelp', 'JP-13-TOKYO', 'starter-v1', 170),
  ('kelp:au:nsw:sydney', 'AU', 'Australia', 'NSW', 'New South Wales', 'Sydney', 'Australia/Sydney', 'kelp', 'AU-NSW-SYDNEY', 'starter-v1', 180)
on conflict (location_key) do update set
  country_code = excluded.country_code,
  country_name = excluded.country_name,
  region_code = excluded.region_code,
  region_name = excluded.region_name,
  city_name = excluded.city_name,
  time_zone = excluded.time_zone,
  provider = excluded.provider,
  provider_reference = excluded.provider_reference,
  source_revision = excluded.source_revision,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

create table if not exists public.profile_theme_presets (
  theme_key text primary key,
  display_name text not null,
  description text not null default '',
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_theme_presets_key_check check (theme_key ~ '^[a-z][a-z0-9._-]{0,63}$'),
  constraint profile_theme_presets_name_check check (btrim(display_name) <> '' and char_length(display_name) <= 80),
  constraint profile_theme_presets_description_check check (char_length(description) <= 240)
);

insert into public.profile_theme_presets (theme_key, display_name, description, sort_order)
values
  ('ocean', 'Ocean', 'A calm blue gradient with soft green highlights.', 10),
  ('kelp', 'Kelp', 'A softened green gradient inspired by Kelp.', 20),
  ('coral', 'Coral', 'A warm, softened red gradient.', 30),
  ('orchid', 'Orchid', 'A gentle purple gradient.', 40),
  ('sunrise', 'Sunrise', 'A warm orange and gold gradient.', 50),
  ('slate', 'Slate', 'A quiet neutral gradient with cool highlights.', 60)
on conflict (theme_key) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

create table if not exists public.profile_option_definitions (
  category text not null,
  option_key text not null,
  display_name text not null,
  description text not null default '',
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (category, option_key),
  constraint profile_option_definitions_category_check check (category in ('hobby', 'learning_goal')),
  constraint profile_option_definitions_key_check check (option_key ~ '^[a-z][a-z0-9._-]{0,95}$'),
  constraint profile_option_definitions_name_check check (btrim(display_name) <> '' and char_length(display_name) <= 120),
  constraint profile_option_definitions_description_check check (char_length(description) <= 300)
);

insert into public.profile_option_definitions (category, option_key, display_name, sort_order)
values
  ('hobby', 'reading', 'Reading', 10),
  ('hobby', 'music', 'Music', 20),
  ('hobby', 'gaming', 'Gaming', 30),
  ('hobby', 'sports-fitness', 'Sports and fitness', 40),
  ('hobby', 'art-design', 'Art and design', 50),
  ('hobby', 'coding-technology', 'Coding and technology', 60),
  ('hobby', 'science-experiments', 'Science and experiments', 70),
  ('hobby', 'nature-outdoors', 'Nature and outdoors', 80),
  ('hobby', 'cooking', 'Cooking', 90),
  ('hobby', 'travel-cultures', 'Travel and cultures', 100),
  ('hobby', 'languages', 'Languages', 110),
  ('hobby', 'writing', 'Writing', 120),
  ('hobby', 'films-tv', 'Films and television', 130),
  ('hobby', 'crafts-diy', 'Crafts and DIY', 140),
  ('hobby', 'volunteering', 'Volunteering', 150),
  ('learning_goal', 'improve-grades', 'Improve school grades', 10),
  ('learning_goal', 'exam-preparation', 'Prepare for an exam', 20),
  ('learning_goal', 'strengthen-foundations', 'Strengthen the fundamentals', 30),
  ('learning_goal', 'catch-up', 'Catch up on missed topics', 40),
  ('learning_goal', 'learn-ahead', 'Learn ahead of the current course', 50),
  ('learning_goal', 'problem-solving', 'Build problem-solving skills', 60),
  ('learning_goal', 'complete-project', 'Complete a project', 70),
  ('learning_goal', 'university-preparation', 'Prepare for university or college', 80),
  ('learning_goal', 'explore-subject', 'Explore a subject', 90),
  ('learning_goal', 'study-habits', 'Build stronger study habits', 100)
on conflict (category, option_key) do update set
  display_name = excluded.display_name,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

alter table public.profiles
  add column if not exists location_key text,
  add column if not exists profile_completed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_location_key_fkey') then
    alter table public.profiles
      add constraint profiles_location_key_fkey
      foreign key (location_key) references public.profile_locations(location_key) on delete restrict;
  end if;
end;
$$;

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  theme_key text not null default 'ocean' references public.profile_theme_presets(theme_key) on delete restrict,
  time_zone text not null default 'UTC',
  time_zone_confirmed_at timestamptz,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_preferences_time_zone_check check (btrim(time_zone) <> '' and char_length(time_zone) <= 100),
  constraint user_preferences_schema_version_check check (schema_version > 0)
);

create table if not exists public.user_profile_option_selections (
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  option_key text not null,
  selected_at timestamptz not null default now(),
  primary key (user_id, category, option_key),
  foreign key (category, option_key)
    references public.profile_option_definitions(category, option_key) on delete restrict,
  constraint user_profile_option_selections_category_check check (category in ('hobby', 'learning_goal'))
);

create index if not exists user_profile_option_selections_user_idx
on public.user_profile_option_selections (user_id, category, selected_at, option_key);

create table if not exists public.profile_change_events (
  id bigint generated by default as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null,
  changed_fields text[] not null default array[]::text[],
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint profile_change_events_type_check check (
    event_type in ('profile_updated', 'profile_choices_updated', 'preferences_updated', 'preferences_reset')
  ),
  constraint profile_change_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists profile_change_events_user_idx
on public.profile_change_events (user_id, occurred_at desc, id desc);

drop trigger if exists profile_locations_set_updated_at on public.profile_locations;
create trigger profile_locations_set_updated_at before update on public.profile_locations
for each row execute function public.set_updated_at();

drop trigger if exists profile_theme_presets_set_updated_at on public.profile_theme_presets;
create trigger profile_theme_presets_set_updated_at before update on public.profile_theme_presets
for each row execute function public.set_updated_at();

drop trigger if exists profile_option_definitions_set_updated_at on public.profile_option_definitions;
create trigger profile_option_definitions_set_updated_at before update on public.profile_option_definitions
for each row execute function public.set_updated_at();

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at before update on public.user_preferences
for each row execute function public.set_updated_at();

insert into public.user_preferences (user_id, theme_key, time_zone)
select profile.id, 'ocean', 'UTC' from public.profiles profile
on conflict (user_id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  requested_location_key text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'location_key', '')), '');
  accepted_location_key text;
  requested_time_zone text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'time_zone', '')), '');
  accepted_time_zone text := 'UTC';
  accepted_birth_date date;
  completed_at_value timestamptz;
begin
  if requested_location_key is not null then
    select location.location_key into accepted_location_key
    from public.profile_locations location
    where location.location_key = requested_location_key and location.active;
  end if;

  if requested_time_zone is not null and exists (
    select 1 from pg_catalog.pg_timezone_names where name = requested_time_zone
  ) then accepted_time_zone := requested_time_zone; end if;

  begin
    accepted_birth_date := nullif(new.raw_user_meta_data ->> 'birth_date', '')::date;
  exception when invalid_text_representation or datetime_field_overflow then
    accepted_birth_date := null;
  end;

  if accepted_birth_date is not null and (
    accepted_birth_date > current_date or accepted_birth_date < current_date - interval '120 years'
  ) then accepted_birth_date := null; end if;

  if btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')) <> ''
    and accepted_birth_date is not null
    and accepted_location_key is not null
    and requested_time_zone is not null
    and accepted_time_zone = requested_time_zone
  then completed_at_value := now(); end if;

  insert into public.profiles (
    id, full_name, email, role, birth_date, location_key, profile_completed_at
  ) values (
    new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), coalesce(new.email, ''),
    'student', accepted_birth_date, accepted_location_key, completed_at_value
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    birth_date = coalesce(public.profiles.birth_date, excluded.birth_date),
    location_key = coalesce(public.profiles.location_key, excluded.location_key),
    profile_completed_at = coalesce(public.profiles.profile_completed_at, excluded.profile_completed_at);

  insert into public.user_preferences (user_id, theme_key, time_zone, time_zone_confirmed_at)
  values (
    new.id, 'ocean', accepted_time_zone,
    case when requested_time_zone is not null and accepted_time_zone = requested_time_zone then now() end
  ) on conflict (user_id) do nothing;

  return new;
end;
$$;

create or replace function public.list_profile_locations()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', location.location_key,
    'countryCode', location.country_code,
    'countryName', location.country_name,
    'regionCode', location.region_code,
    'regionName', location.region_name,
    'cityName', location.city_name,
    'timeZone', location.time_zone
  ) order by location.country_name, location.region_name, location.city_name, location.location_key), '[]'::jsonb)
  from public.profile_locations location where location.active;
$$;

create or replace function public.list_profile_configuration_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  result jsonb;
begin
  if caller_id is null then raise exception 'Authentication is required.'; end if;
  select jsonb_build_object(
    'themes', coalesce((select jsonb_agg(jsonb_build_object(
      'key', preset.theme_key, 'name', preset.display_name, 'description', preset.description
    ) order by preset.sort_order, preset.theme_key)
      from public.profile_theme_presets preset where preset.active), '[]'::jsonb),
    'hobbies', coalesce((select jsonb_agg(jsonb_build_object(
      'key', option.option_key, 'name', option.display_name, 'description', option.description
    ) order by option.sort_order, option.option_key)
      from public.profile_option_definitions option
      where option.category = 'hobby' and option.active), '[]'::jsonb),
    'learningGoals', coalesce((select jsonb_agg(jsonb_build_object(
      'key', option.option_key, 'name', option.display_name, 'description', option.description
    ) order by option.sort_order, option.option_key)
      from public.profile_option_definitions option
      where option.category = 'learning_goal' and option.active), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.get_my_profile_configuration()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  result jsonb;
begin
  if caller_id is null then raise exception 'Authentication is required.'; end if;
  select jsonb_build_object(
    'version', 1,
    'profile', jsonb_build_object(
      'id', profile.id, 'fullName', profile.full_name, 'email', profile.email,
      'birthDate', profile.birth_date, 'createdAt', profile.created_at, 'updatedAt', profile.updated_at,
      'joinedWeeks', greatest(0, floor(extract(epoch from (now() - profile.created_at)) / 604800))::integer,
      'profileCompletedAt', profile.profile_completed_at,
      'location', case when location.location_key is null then null else jsonb_build_object(
        'key', location.location_key, 'countryCode', location.country_code,
        'countryName', location.country_name, 'regionCode', location.region_code,
        'regionName', location.region_name, 'cityName', location.city_name,
        'timeZone', location.time_zone
      ) end
    ),
    'preferences', jsonb_build_object(
      'themeKey', preferences.theme_key, 'timeZone', preferences.time_zone,
      'timeZoneConfirmedAt', preferences.time_zone_confirmed_at,
      'schemaVersion', preferences.schema_version
    ),
    'hobbies', coalesce((select jsonb_agg(jsonb_build_object(
      'key', option.option_key, 'name', option.display_name
    ) order by option.sort_order, option.option_key)
      from public.user_profile_option_selections selection
      join public.profile_option_definitions option
        on option.category = selection.category and option.option_key = selection.option_key
      where selection.user_id = caller_id and selection.category = 'hobby'), '[]'::jsonb),
    'learningGoals', coalesce((select jsonb_agg(jsonb_build_object(
      'key', option.option_key, 'name', option.display_name
    ) order by option.sort_order, option.option_key)
      from public.user_profile_option_selections selection
      join public.profile_option_definitions option
        on option.category = selection.category and option.option_key = selection.option_key
      where selection.user_id = caller_id and selection.category = 'learning_goal'), '[]'::jsonb),
    'learningSummary', jsonb_build_object(
      'status', 'awaiting_learning_domains', 'activeTutors', null,
      'completedClasses', null, 'completedCourses', null, 'tutoringMinutes', null
    )
  ) into result
  from public.profiles profile
  left join public.profile_locations location on location.location_key = profile.location_key
  left join public.user_preferences preferences on preferences.user_id = profile.id
  where profile.id = caller_id;
  if result is null then raise exception 'Your Profile could not be found.'; end if;
  return result;
end;
$$;

create or replace function public.save_my_student_profile(
  p_profile jsonb,
  p_hobby_keys text[] default array[]::text[],
  p_learning_goal_keys text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  existing_profile public.profiles%rowtype;
  normalized_name text;
  requested_location_key text;
  requested_birth_date date;
  normalized_hobbies text[];
  normalized_goals text[];
  changed_fields text[] := array[]::text[];
begin
  if caller_id is null or not public.authorization_user_has_capability(caller_id, 'workspace.student') then
    raise exception 'Your assigned roles cannot update a Student Profile.';
  end if;
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'The Profile update must be an object.';
  end if;
  select * into existing_profile from public.profiles where id = caller_id for update;
  if not found then raise exception 'Your Profile could not be found.'; end if;

  normalized_name := btrim(coalesce(p_profile ->> 'fullName', ''));
  if normalized_name = '' or char_length(normalized_name) > 160 then
    raise exception 'Full name is required and must contain at most 160 characters.';
  end if;
  requested_location_key := nullif(btrim(coalesce(p_profile ->> 'locationKey', '')), '');
  if requested_location_key is null or not exists (
    select 1 from public.profile_locations where location_key = requested_location_key and active
  ) then raise exception 'Choose an available country, state, and city.'; end if;

  if nullif(btrim(coalesce(p_profile ->> 'birthDate', '')), '') is not null then
    begin
      requested_birth_date := (p_profile ->> 'birthDate')::date;
    exception when invalid_text_representation or datetime_field_overflow then
      raise exception 'Birth date is invalid.';
    end;
  end if;
  if existing_profile.birth_date is not null and requested_birth_date is not null
    and requested_birth_date is distinct from existing_profile.birth_date
  then raise exception 'Birth date corrections require Support review.'; end if;
  requested_birth_date := coalesce(existing_profile.birth_date, requested_birth_date);
  if requested_birth_date is null or requested_birth_date > current_date
    or requested_birth_date < current_date - interval '120 years'
  then raise exception 'A valid birth date is required.'; end if;

  select coalesce(array_agg(value order by value), array[]::text[]) into normalized_hobbies
  from (select distinct lower(btrim(item)) as value
    from unnest(coalesce(p_hobby_keys, array[]::text[])) item where btrim(item) <> '') selected;
  select coalesce(array_agg(value order by value), array[]::text[]) into normalized_goals
  from (select distinct lower(btrim(item)) as value
    from unnest(coalesce(p_learning_goal_keys, array[]::text[])) item where btrim(item) <> '') selected;

  if cardinality(normalized_hobbies) > 12 then raise exception 'Choose at most 12 hobbies.'; end if;
  if cardinality(normalized_goals) > 8 then raise exception 'Choose at most 8 learning goals.'; end if;
  if cardinality(normalized_hobbies) <> (select count(*) from public.profile_option_definitions option
    where option.category = 'hobby' and option.active and option.option_key = any(normalized_hobbies))
  then raise exception 'One or more hobby choices are unavailable.'; end if;
  if cardinality(normalized_goals) <> (select count(*) from public.profile_option_definitions option
    where option.category = 'learning_goal' and option.active and option.option_key = any(normalized_goals))
  then raise exception 'One or more learning-goal choices are unavailable.'; end if;

  if normalized_name is distinct from existing_profile.full_name then
    changed_fields := array_append(changed_fields, 'full_name'); end if;
  if requested_location_key is distinct from existing_profile.location_key then
    changed_fields := array_append(changed_fields, 'location'); end if;
  if existing_profile.birth_date is null then changed_fields := array_append(changed_fields, 'birth_date'); end if;

  update public.profiles set
    full_name = normalized_name,
    birth_date = requested_birth_date,
    location_key = requested_location_key,
    profile_completed_at = case when exists (
      select 1 from public.user_preferences preferences
      where preferences.user_id = caller_id and preferences.time_zone_confirmed_at is not null
    ) then coalesce(profile_completed_at, now()) else profile_completed_at end
  where id = caller_id;

  delete from public.user_profile_option_selections
  where user_id = caller_id and category in ('hobby', 'learning_goal');
  insert into public.user_profile_option_selections (user_id, category, option_key)
  select caller_id, 'hobby', item from unnest(normalized_hobbies) item;
  insert into public.user_profile_option_selections (user_id, category, option_key)
  select caller_id, 'learning_goal', item from unnest(normalized_goals) item;

  insert into public.profile_change_events (user_id, actor_user_id, event_type, changed_fields, metadata)
  values (
    caller_id, caller_id, 'profile_updated', changed_fields || array['hobbies', 'learning_goals'],
    jsonb_build_object('hobbyCount', cardinality(normalized_hobbies), 'learningGoalCount', cardinality(normalized_goals))
  );
  return public.get_my_profile_configuration();
end;
$$;

create or replace function public.save_my_preferences(p_preferences jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  requested_theme text;
  requested_time_zone text;
begin
  if caller_id is null then raise exception 'Authentication is required.'; end if;
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then
    raise exception 'The preference update must be an object.';
  end if;
  requested_theme := lower(btrim(coalesce(p_preferences ->> 'themeKey', '')));
  requested_time_zone := btrim(coalesce(p_preferences ->> 'timeZone', ''));
  if not exists (select 1 from public.profile_theme_presets where theme_key = requested_theme and active)
  then raise exception 'Choose an available theme.'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = requested_time_zone)
  then raise exception 'Choose a valid IANA timezone.'; end if;

  insert into public.user_preferences (user_id, theme_key, time_zone, time_zone_confirmed_at)
  values (caller_id, requested_theme, requested_time_zone, now())
  on conflict (user_id) do update set
    theme_key = excluded.theme_key,
    time_zone = excluded.time_zone,
    time_zone_confirmed_at = excluded.time_zone_confirmed_at;

  update public.profiles set profile_completed_at = case
    when btrim(full_name) <> '' and birth_date is not null and location_key is not null
      then coalesce(profile_completed_at, now()) else profile_completed_at end
  where id = caller_id;
  insert into public.profile_change_events (user_id, actor_user_id, event_type, changed_fields)
  values (caller_id, caller_id, 'preferences_updated', array['theme', 'time_zone']);
  return public.get_my_profile_configuration();
end;
$$;

create or replace function public.reset_my_preferences(p_scope text default 'all')
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  normalized_scope text := lower(btrim(coalesce(p_scope, 'all')));
begin
  if caller_id is null then raise exception 'Authentication is required.'; end if;
  if normalized_scope not in ('theme', 'time_zone', 'all') then
    raise exception 'Preference reset scope is invalid.'; end if;
  insert into public.user_preferences (user_id) values (caller_id)
  on conflict (user_id) do nothing;
  if normalized_scope in ('theme', 'all') then
    update public.user_preferences set theme_key = 'ocean' where user_id = caller_id; end if;
  if normalized_scope in ('time_zone', 'all') then
    update public.user_preferences set time_zone = 'UTC', time_zone_confirmed_at = null
    where user_id = caller_id;
    update public.profiles set profile_completed_at = null where id = caller_id;
  end if;
  insert into public.profile_change_events (user_id, actor_user_id, event_type, changed_fields, metadata)
  values (
    caller_id, caller_id, 'preferences_reset',
    case normalized_scope when 'theme' then array['theme']
      when 'time_zone' then array['time_zone'] else array['theme', 'time_zone'] end,
    jsonb_build_object('scope', normalized_scope)
  );
  return public.get_my_profile_configuration();
end;
$$;

alter table public.profile_locations enable row level security;
alter table public.profile_theme_presets enable row level security;
alter table public.profile_option_definitions enable row level security;
alter table public.user_preferences enable row level security;
alter table public.user_profile_option_selections enable row level security;
alter table public.profile_change_events enable row level security;

drop policy if exists "Authenticated users can read active Profile themes" on public.profile_theme_presets;
create policy "Authenticated users can read active Profile themes"
on public.profile_theme_presets for select to authenticated using (active);
drop policy if exists "Authenticated users can read active Profile options" on public.profile_option_definitions;
create policy "Authenticated users can read active Profile options"
on public.profile_option_definitions for select to authenticated using (active);
drop policy if exists "Users can read their own preferences" on public.user_preferences;
create policy "Users can read their own preferences"
on public.user_preferences for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can read their own Profile choices" on public.user_profile_option_selections;
create policy "Users can read their own Profile choices"
on public.user_profile_option_selections for select to authenticated using (auth.uid() = user_id);

revoke all on public.profile_locations from anon, authenticated;
revoke all on public.profile_theme_presets from anon, authenticated;
revoke all on public.profile_option_definitions from anon, authenticated;
revoke all on public.user_preferences from anon, authenticated;
revoke all on public.user_profile_option_selections from anon, authenticated;
revoke all on public.profile_change_events from anon, authenticated;
grant select on public.profile_theme_presets to authenticated;
grant select on public.profile_option_definitions to authenticated;
grant select on public.user_preferences to authenticated;
grant select on public.user_profile_option_selections to authenticated;
revoke update on public.profiles from authenticated;

revoke all on function public.list_profile_locations() from public, anon, authenticated;
revoke all on function public.list_profile_configuration_options() from public, anon, authenticated;
revoke all on function public.get_my_profile_configuration() from public, anon, authenticated;
revoke all on function public.save_my_student_profile(jsonb, text[], text[]) from public, anon, authenticated;
revoke all on function public.save_my_preferences(jsonb) from public, anon, authenticated;
revoke all on function public.reset_my_preferences(text) from public, anon, authenticated;
grant execute on function public.list_profile_locations() to anon, authenticated;
grant execute on function public.list_profile_configuration_options() to authenticated;
grant execute on function public.get_my_profile_configuration() to authenticated;
grant execute on function public.save_my_student_profile(jsonb, text[], text[]) to authenticated;
grant execute on function public.save_my_preferences(jsonb) to authenticated;
grant execute on function public.reset_my_preferences(text) to authenticated;

comment on function public.get_my_profile_configuration() is
  'Returns only the authenticated account owner Profile and configuration. Relationship-scoped educational projections are introduced later.';
