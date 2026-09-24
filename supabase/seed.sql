-- Demo data: 3 teams and a placeholder roster (6 + 6 + 5 students, 1 advisor).
-- These emails are fake (.test is a reserved domain). Never put real student
-- emails in this file: the repository is public.
--
-- Local: runs automatically on `npx supabase db reset`.
-- Hosted: paste into the Supabase SQL editor once, then run `npm run seed:users`.

insert into public.teams (id, name, starting_capital) values
  ('00000000-0000-0000-0000-00000000000a', 'Team A', 100000),
  ('00000000-0000-0000-0000-00000000000b', 'Team B', 100000),
  ('00000000-0000-0000-0000-00000000000c', 'Team C', 100000);

insert into public.roster_invites (email, team_id, role, is_president) values
  -- Team A (6): Malik leads and is president
  ('malik@demo.test',     '00000000-0000-0000-0000-00000000000a', 'leader', true),
  ('a2@demo.test',        '00000000-0000-0000-0000-00000000000a', 'member', false),
  ('a3@demo.test',        '00000000-0000-0000-0000-00000000000a', 'member', false),
  ('a4@demo.test',        '00000000-0000-0000-0000-00000000000a', 'member', false),
  ('a5@demo.test',        '00000000-0000-0000-0000-00000000000a', 'member', false),
  ('a6@demo.test',        '00000000-0000-0000-0000-00000000000a', 'member', false),
  -- Team B (6): Samantha leads
  ('samantha@demo.test',  '00000000-0000-0000-0000-00000000000b', 'leader', false),
  ('b2@demo.test',        '00000000-0000-0000-0000-00000000000b', 'member', false),
  ('b3@demo.test',        '00000000-0000-0000-0000-00000000000b', 'member', false),
  ('b4@demo.test',        '00000000-0000-0000-0000-00000000000b', 'member', false),
  ('b5@demo.test',        '00000000-0000-0000-0000-00000000000b', 'member', false),
  ('b6@demo.test',        '00000000-0000-0000-0000-00000000000b', 'member', false),
  -- Team C (5): Gabe leads
  ('gabe@demo.test',      '00000000-0000-0000-0000-00000000000c', 'leader', false),
  ('c2@demo.test',        '00000000-0000-0000-0000-00000000000c', 'member', false),
  ('c3@demo.test',        '00000000-0000-0000-0000-00000000000c', 'member', false),
  ('c4@demo.test',        '00000000-0000-0000-0000-00000000000c', 'member', false),
  ('c5@demo.test',        '00000000-0000-0000-0000-00000000000c', 'member', false),
  -- Advisor (no team)
  ('walsworth@demo.test', null,                                    'advisor', false);
