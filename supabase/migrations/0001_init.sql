create table profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  display_name text,
  pco_access_token text,
  pco_refresh_token text,
  pco_token_expires_at timestamptz,
  pco_org_id text,
  created_at timestamptz default now()
);

create table setlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  date date,
  created_at timestamptz default now(),
  modified_at timestamptz default now()
);

create table songs (
  id uuid primary key default gen_random_uuid(),
  setlist_id uuid not null references setlists(id) on delete cascade,
  position int not null,
  title text not null,
  artist text,
  key_of text not null default 'C',
  bpm int,
  spotify_url text,
  youtube_url text,
  transition jsonb,
  view text default 'flow',
  created_at timestamptz default now(),
  modified_at timestamptz default now()
);

create table flow_sections (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references songs(id) on delete cascade,
  position int not null,
  type text not null,
  label text not null,
  note text
);

create table chord_sheets (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references songs(id) on delete cascade,
  key_of text not null,
  content text not null,
  generated_at timestamptz default now(),
  unique (song_id, key_of)
);

create function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table profiles enable row level security;
create policy "profiles: own row" on profiles for all using (auth.uid() = id);

alter table setlists enable row level security;
create policy "setlists: own" on setlists for all using (auth.uid() = user_id);

alter table songs enable row level security;
create policy "songs: via setlist" on songs for all using (
  exists (select 1 from setlists where id = songs.setlist_id and user_id = auth.uid())
);

alter table flow_sections enable row level security;
create policy "sections: via song" on flow_sections for all using (
  exists (
    select 1 from songs s
    join setlists sl on sl.id = s.setlist_id
    where s.id = flow_sections.song_id and sl.user_id = auth.uid()
  )
);

alter table chord_sheets enable row level security;
create policy "chords: via song" on chord_sheets for all using (
  exists (
    select 1 from songs s
    join setlists sl on sl.id = s.setlist_id
    where s.id = chord_sheets.song_id and sl.user_id = auth.uid()
  )
);
