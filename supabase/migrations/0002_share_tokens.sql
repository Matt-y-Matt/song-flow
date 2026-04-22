alter table setlists add column if not exists share_token uuid unique default null;
create index if not exists setlists_share_token_idx on setlists(share_token);

-- Public read policies: anyone with the share_token URL can view the setlist and
-- its children. Writes remain gated by the owner-only policies from 0001_init.sql.
create policy "setlists: public view by token" on setlists
  for select using (share_token is not null);

create policy "songs: public view via setlist token" on songs
  for select using (
    exists (select 1 from setlists where id = songs.setlist_id and share_token is not null)
  );

create policy "sections: public view via setlist token" on flow_sections
  for select using (
    exists (
      select 1 from songs s
      join setlists sl on sl.id = s.setlist_id
      where s.id = flow_sections.song_id and sl.share_token is not null
    )
  );

create policy "chords: public view via setlist token" on chord_sheets
  for select using (
    exists (
      select 1 from songs s
      join setlists sl on sl.id = s.setlist_id
      where s.id = chord_sheets.song_id and sl.share_token is not null
    )
  );
