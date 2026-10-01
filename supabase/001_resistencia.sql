-- A Resistência — schema, RLS e funções do jogo
create extension if not exists pgcrypto;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_user uuid not null,
  options jsonb not null default '{"merlin":true,"percival":false,"mordred":false,"oberon":false}',
  phase text not null default 'lobby' check (phase in ('lobby','team','vote','mission','assassin','finished')),
  round int not null default 1,
  leader_seat int not null default 0,
  reject_count int not null default 0,
  team uuid[] not null default '{}',
  voted uuid[] not null default '{}',
  acted uuid[] not null default '{}',
  results jsonb not null default '[]',
  vote_history jsonb not null default '[]',
  log jsonb not null default '[]',
  winner text check (winner in ('resistance','spies')),
  win_reason text,
  reveal jsonb,
  created_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null,
  name text not null,
  seat int not null,
  created_at timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, seat)
);

create table public.messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  name text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index on public.messages (room_id, id);

-- tabelas secretas: sem policies, acesso só via funções security definer
create table public.player_roles (
  player_id uuid primary key references public.players(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  role text not null check (role in ('resistance','merlin','percival','spy','assassin','morgana','mordred','oberon'))
);
create table public.team_votes (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  approve boolean not null,
  primary key (room_id, player_id)
);
create table public.mission_cards (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  success boolean not null,
  primary key (room_id, player_id)
);

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.messages enable row level security;
alter table public.player_roles enable row level security;
alter table public.team_votes enable row level security;
alter table public.mission_cards enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- helpers
create function public.is_member(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from players where room_id = p_room and user_id = auth.uid())
$$;

create function public._me(p_room uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from players where room_id = p_room and user_id = auth.uid()
$$;

create function public._team_size(n int, r int) returns int
language sql immutable as $$
  select (case n
    when 5 then array[2,3,2,3,3]
    when 6 then array[2,3,4,3,4]
    when 7 then array[2,3,3,4,4]
    else array[3,4,4,5,5] end)[r]
$$;

create function public._spies(n int) returns int
language sql immutable as $$
  select case when n <= 6 then 2 when n <= 9 then 3 else 4 end
$$;

create function public._is_evil(r text) returns boolean
language sql immutable as $$
  select r in ('spy','assassin','morgana','mordred','oberon')
$$;

create function public._log(p_room uuid, p_text text) returns void
language sql security definer set search_path = public as $$
  update rooms set log = log || jsonb_build_array(jsonb_build_object('t', now(), 'm', p_text)) where id = p_room
$$;

create function public._pname(p_player uuid) returns text
language sql stable security definer set search_path = public as $$
  select name from players where id = p_player
$$;

create function public._check_options(n int, o jsonb) returns void
language plpgsql immutable as $$
declare
  v_special int;
begin
  if coalesce((o->>'percival')::boolean, false) and not coalesce((o->>'merlin')::boolean, false) then
    raise exception 'O Vigia só funciona junto com o Comandante';
  end if;
  v_special := (case when coalesce((o->>'merlin')::boolean,false) then 1 else 0 end)
             + (case when coalesce((o->>'percival')::boolean,false) then 1 else 0 end)
             + (case when coalesce((o->>'mordred')::boolean,false) then 1 else 0 end)
             + (case when coalesce((o->>'oberon')::boolean,false) then 1 else 0 end);
  if v_special > _spies(n) then
    raise exception 'Muitos papéis especiais para % jogadores', n;
  end if;
end $$;

create function public._finish(p_room uuid, p_winner text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update rooms set phase = 'finished', winner = p_winner, win_reason = p_reason,
    reveal = (select jsonb_object_agg(player_id::text, role) from player_roles where room_id = p_room)
  where id = p_room;
  perform _log(p_room, case when p_winner = 'resistance' then 'A Resistência venceu: ' else 'Os Espiões venceram: ' end || p_reason);
end $$;

-- policies de leitura (somente membros da sala)
create policy rooms_select on public.rooms for select to authenticated using (public.is_member(id));
create policy players_select on public.players for select to authenticated using (public.is_member(room_id));
create policy messages_select on public.messages for select to authenticated using (public.is_member(room_id));
grant select on public.rooms, public.players, public.messages to authenticated;

-- criar / entrar / sair
create function public.create_room(p_name text, p_options jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code text; v_room uuid; v_player uuid; v_opts jsonb;
  v_alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) < 1 or char_length(p_name) > 20 then raise exception 'Nome deve ter de 1 a 20 caracteres'; end if;
  v_opts := coalesce(p_options, '{"merlin":true,"percival":false,"mordred":false,"oberon":false}'::jsonb);
  loop
    v_code := '';
    for i in 1..5 loop
      v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1);
    end loop;
    exit when not exists (select 1 from rooms where code = v_code);
  end loop;
  insert into rooms (code, host_user, options) values (v_code, auth.uid(), v_opts) returning id into v_room;
  insert into players (room_id, user_id, name, seat) values (v_room, auth.uid(), p_name, 0) returning id into v_player;
  perform _log(v_room, p_name || ' criou a sala.');
  return jsonb_build_object('room_id', v_room, 'code', v_code, 'player_id', v_player);
end $$;

create function public.join_room(p_code text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_player uuid; v_count int;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  p_name := btrim(coalesce(p_name, ''));
  select * into v_room from rooms where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'Sala não encontrada'; end if;
  select id into v_player from players where room_id = v_room.id and user_id = auth.uid();
  if v_player is not null then
    return jsonb_build_object('room_id', v_room.id, 'code', v_room.code, 'player_id', v_player);
  end if;
  if v_room.phase <> 'lobby' then raise exception 'A partida já começou'; end if;
  if char_length(p_name) < 1 or char_length(p_name) > 20 then raise exception 'Nome deve ter de 1 a 20 caracteres'; end if;
  select count(*) into v_count from players where room_id = v_room.id;
  if v_count >= 10 then raise exception 'Sala cheia (máximo de 10 jogadores)'; end if;
  if exists (select 1 from players where room_id = v_room.id and lower(name) = lower(p_name)) then
    raise exception 'Já existe um jogador com esse nome na sala';
  end if;
  insert into players (room_id, user_id, name, seat)
  values (v_room.id, auth.uid(), p_name, (select coalesce(max(seat), -1) + 1 from players where room_id = v_room.id))
  returning id into v_player;
  perform _log(v_room.id, p_name || ' entrou na sala.');
  return jsonb_build_object('room_id', v_room.id, 'code', v_room.code, 'player_id', v_player);
end $$;

create function public.leave_room(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid; v_room rooms; v_name text; v_next uuid;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found then return; end if;
  v_me := _me(p_room);
  if v_me is null then return; end if;
  if v_room.phase not in ('lobby', 'finished') then raise exception 'Partida em andamento: você pode voltar depois pelo código da sala'; end if;
  v_name := _pname(v_me);
  delete from players where id = v_me;
  select user_id into v_next from players where room_id = p_room order by seat limit 1;
  if v_next is null then
    delete from rooms where id = p_room;
  else
    if v_room.host_user = auth.uid() then update rooms set host_user = v_next where id = p_room; end if;
    perform _log(p_room, v_name || ' saiu da sala.');
  end if;
end $$;

create function public.kick_player(p_room uuid, p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_room rooms;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.host_user <> auth.uid() then raise exception 'Apenas o anfitrião pode remover jogadores'; end if;
  if v_room.phase <> 'lobby' then raise exception 'Só é possível remover no lobby'; end if;
  if p_player = _me(p_room) then raise exception 'Você não pode remover a si mesmo'; end if;
  perform _log(p_room, _pname(p_player) || ' foi removido da sala.');
  delete from players where id = p_player and room_id = p_room;
end $$;

create function public.update_options(p_room uuid, p_options jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_room rooms;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.host_user <> auth.uid() then raise exception 'Apenas o anfitrião pode mudar as opções'; end if;
  if v_room.phase <> 'lobby' then raise exception 'Só é possível mudar no lobby'; end if;
  update rooms set options = jsonb_build_object(
    'merlin', coalesce((p_options->>'merlin')::boolean, false),
    'percival', coalesce((p_options->>'percival')::boolean, false),
    'mordred', coalesce((p_options->>'mordred')::boolean, false),
    'oberon', coalesce((p_options->>'oberon')::boolean, false)
  ) where id = p_room;
end $$;

-- iniciar / reiniciar
create function public.start_game(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_n int; v_roles text[] := '{}'; v_spies int; v_evil_special int := 0; v_good_special int := 0; v_opts jsonb;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.host_user <> auth.uid() then raise exception 'Apenas o anfitrião pode iniciar'; end if;
  if v_room.phase <> 'lobby' then raise exception 'A partida já começou'; end if;
  select count(*) into v_n from players where room_id = p_room;
  if v_n < 5 then raise exception 'São necessários pelo menos 5 jogadores'; end if;
  v_opts := v_room.options;
  perform _check_options(v_n, v_opts);
  v_spies := _spies(v_n);

  if coalesce((v_opts->>'merlin')::boolean, false) then
    v_roles := array_cat(v_roles, array['merlin','assassin']::text[]); v_good_special := v_good_special + 1; v_evil_special := v_evil_special + 1;
  end if;
  if coalesce((v_opts->>'percival')::boolean, false) then
    v_roles := array_cat(v_roles, array['percival','morgana']::text[]); v_good_special := v_good_special + 1; v_evil_special := v_evil_special + 1;
  end if;
  if coalesce((v_opts->>'mordred')::boolean, false) then v_roles := array_append(v_roles, 'mordred'::text); v_evil_special := v_evil_special + 1; end if;
  if coalesce((v_opts->>'oberon')::boolean, false) then v_roles := array_append(v_roles, 'oberon'::text); v_evil_special := v_evil_special + 1; end if;
  for i in 1..(v_spies - v_evil_special) loop v_roles := array_append(v_roles, 'spy'::text); end loop;
  for i in 1..(v_n - v_spies - v_good_special) loop v_roles := array_append(v_roles, 'resistance'::text); end loop;

  -- compacta os assentos 0..n-1 (dois passos para respeitar a unique)
  update players set seat = seat + 1000 where room_id = p_room;
  update players p set seat = s.rn - 1 from (
    select id, row_number() over (order by seat) as rn from players where room_id = p_room
  ) s where p.id = s.id;

  delete from player_roles where room_id = p_room;
  insert into player_roles (player_id, room_id, role)
  select p.id, p_room, r.role
  from (select id, row_number() over (order by seat) as rn from players where room_id = p_room) p
  join (select role, row_number() over (order by random()) as rn from unnest(v_roles) as role) r on r.rn = p.rn;

  delete from team_votes where room_id = p_room;
  delete from mission_cards where room_id = p_room;
  update rooms set phase = 'team', round = 1, leader_seat = floor(random() * v_n)::int, reject_count = 0,
    team = '{}', voted = '{}', acted = '{}', results = '[]', vote_history = '[]', winner = null, win_reason = null, reveal = null
  where id = p_room;
  perform _log(p_room, 'A partida começou com ' || v_n || ' jogadores (' || v_spies || ' espiões).');
end $$;

create function public.reset_room(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_room rooms;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.host_user <> auth.uid() then raise exception 'Apenas o anfitrião pode voltar ao lobby'; end if;
  delete from player_roles where room_id = p_room;
  delete from team_votes where room_id = p_room;
  delete from mission_cards where room_id = p_room;
  update rooms set phase = 'lobby', round = 1, leader_seat = 0, reject_count = 0, team = '{}', voted = '{}', acted = '{}',
    results = '[]', vote_history = '[]', winner = null, win_reason = null, reveal = null where id = p_room;
  perform _log(p_room, 'De volta ao lobby.');
end $$;

-- visão secreta do jogador
create function public.get_my_view(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid; v_role text; v_known jsonb := '[]';
begin
  v_me := _me(p_room);
  if v_me is null then raise exception 'Você não está nesta sala'; end if;
  select role into v_role from player_roles where player_id = v_me;
  if v_role is null then return jsonb_build_object('player_id', v_me, 'role', null, 'known', '[]'::jsonb); end if;

  if v_role in ('spy','assassin','morgana','mordred') then
    select coalesce(jsonb_agg(jsonb_build_object('player_id', player_id, 'label', 'spy')), '[]') into v_known
    from player_roles where room_id = p_room and player_id <> v_me and role in ('spy','assassin','morgana','mordred');
  elsif v_role = 'merlin' then
    select coalesce(jsonb_agg(jsonb_build_object('player_id', player_id, 'label', 'spy')), '[]') into v_known
    from player_roles where room_id = p_room and role in ('spy','assassin','morgana','oberon');
  elsif v_role = 'percival' then
    select coalesce(jsonb_agg(jsonb_build_object('player_id', player_id, 'label', 'merlin?')), '[]') into v_known
    from player_roles where room_id = p_room and role in ('merlin','morgana');
  end if;
  return jsonb_build_object('player_id', v_me, 'role', v_role, 'known', v_known);
end $$;

-- fluxo da rodada
create function public.propose_team(p_room uuid, p_team uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_me uuid; v_leader uuid; v_n int; v_size int; v_names text;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found then raise exception 'Sala não encontrada'; end if;
  v_me := _me(p_room);
  select id into v_leader from players where room_id = p_room and seat = v_room.leader_seat;
  if v_room.phase <> 'team' then raise exception 'Não é hora de montar a equipe'; end if;
  if v_me is distinct from v_leader then raise exception 'Apenas o líder monta a equipe'; end if;
  select count(*) into v_n from players where room_id = p_room;
  v_size := _team_size(v_n, v_room.round);
  if (select count(distinct x) from unnest(p_team) x) <> v_size then raise exception 'A equipe precisa ter % jogadores', v_size; end if;
  if (select count(*) from players where room_id = p_room and id = any(p_team)) <> v_size then raise exception 'Jogador inválido na equipe'; end if;
  delete from team_votes where room_id = p_room;
  update rooms set team = p_team, phase = 'vote', voted = '{}' where id = p_room;
  select string_agg(name, ', ' order by seat) into v_names from players where id = any(p_team);
  perform _log(p_room, _pname(v_me) || ' propôs a equipe: ' || v_names || '.');
end $$;

create function public.cast_vote(p_room uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_me uuid; v_n int; v_cnt int; v_votes jsonb; v_yes int; v_ok boolean; v_leader uuid;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found then raise exception 'Sala não encontrada'; end if;
  v_me := _me(p_room);
  if v_me is null then raise exception 'Você não está nesta sala'; end if;
  if v_room.phase <> 'vote' then raise exception 'Não é hora de votar'; end if;
  insert into team_votes (room_id, player_id, approve) values (p_room, v_me, p_approve)
  on conflict (room_id, player_id) do update set approve = excluded.approve;
  select count(*) into v_n from players where room_id = p_room;
  select count(*), coalesce(jsonb_object_agg(player_id::text, approve), '{}'), count(*) filter (where approve)
    into v_cnt, v_votes, v_yes from team_votes where room_id = p_room;
  update rooms set voted = (select coalesce(array_agg(player_id), '{}') from team_votes where room_id = p_room) where id = p_room;
  if v_cnt < v_n then return; end if;

  v_ok := v_yes * 2 > v_n;
  select id into v_leader from players where room_id = p_room and seat = v_room.leader_seat;
  update rooms set vote_history = vote_history || jsonb_build_array(jsonb_build_object(
    'round', v_room.round, 'attempt', v_room.reject_count + 1, 'leader', v_leader,
    'team', to_jsonb(v_room.team), 'votes', v_votes, 'approved', v_ok)) where id = p_room;
  delete from team_votes where room_id = p_room;
  perform _log(p_room, 'Votação: ' || (case when v_ok then 'equipe APROVADA' else 'equipe REJEITADA' end) || ' (' || v_yes || ' a favor, ' || (v_n - v_yes) || ' contra).');

  if v_ok then
    update rooms set phase = 'mission', acted = '{}' where id = p_room;
  elsif v_room.reject_count + 1 >= 5 then
    update rooms set reject_count = v_room.reject_count + 1, team = '{}', voted = '{}' where id = p_room;
    perform _finish(p_room, 'spies', 'cinco equipes rejeitadas seguidas');
  else
    update rooms set reject_count = v_room.reject_count + 1, leader_seat = (v_room.leader_seat + 1) % v_n,
      phase = 'team', team = '{}', voted = '{}' where id = p_room;
  end if;
end $$;

create function public.play_mission(p_room uuid, p_success boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_me uuid; v_role text; v_n int; v_size int; v_cnt int; v_fails int; v_failed boolean;
  v_wins int; v_losses int; v_results jsonb;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found then raise exception 'Sala não encontrada'; end if;
  v_me := _me(p_room);
  if v_room.phase <> 'mission' then raise exception 'Não é hora da missão'; end if;
  if v_me is null or not (v_me = any(v_room.team)) then raise exception 'Você não está na equipe da missão'; end if;
  select role into v_role from player_roles where player_id = v_me;
  if not _is_evil(v_role) and not p_success then raise exception 'A Resistência só pode jogar Sucesso'; end if;
  insert into mission_cards (room_id, player_id, success) values (p_room, v_me, p_success)
  on conflict (room_id, player_id) do update set success = excluded.success;
  update rooms set acted = (select coalesce(array_agg(player_id), '{}') from mission_cards where room_id = p_room) where id = p_room;

  select count(*) into v_n from players where room_id = p_room;
  v_size := _team_size(v_n, v_room.round);
  select count(*), count(*) filter (where not success) into v_cnt, v_fails from mission_cards where room_id = p_room;
  if v_cnt < v_size then return; end if;

  v_failed := v_fails >= (case when v_n >= 7 and v_room.round = 4 then 2 else 1 end);
  v_results := v_room.results || jsonb_build_array(jsonb_build_object(
    'round', v_room.round, 'size', v_size, 'fails', v_fails, 'success', not v_failed));
  delete from mission_cards where room_id = p_room;
  perform _log(p_room, 'Missão ' || v_room.round || ': ' || (case when v_failed then 'FALHOU' else 'SUCESSO' end) || ' (' || v_fails || ' carta(s) de falha).');
  select count(*) filter (where (e->>'success')::boolean), count(*) filter (where not (e->>'success')::boolean)
    into v_wins, v_losses from jsonb_array_elements(v_results) e;

  update rooms set results = v_results, acted = '{}', team = '{}', voted = '{}' where id = p_room;
  if v_losses >= 3 then
    perform _finish(p_room, 'spies', 'três missões falharam');
  elsif v_wins >= 3 then
    if coalesce((v_room.options->>'merlin')::boolean, false) then
      update rooms set phase = 'assassin' where id = p_room;
      perform _log(p_room, 'A Resistência completou 3 missões! O Assassino tem uma última chance de achar o Comandante.');
    else
      perform _finish(p_room, 'resistance', 'três missões bem-sucedidas');
    end if;
  else
    update rooms set round = v_room.round + 1, reject_count = 0, leader_seat = (v_room.leader_seat + 1) % v_n, phase = 'team' where id = p_room;
  end if;
end $$;

create function public.assassinate(p_room uuid, p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_me uuid; v_role text; v_trole text;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found then raise exception 'Sala não encontrada'; end if;
  if v_room.phase <> 'assassin' then raise exception 'Não é hora do assassinato'; end if;
  v_me := _me(p_room);
  select role into v_role from player_roles where player_id = v_me;
  if v_role is distinct from 'assassin' then raise exception 'Apenas o Assassino pode escolher'; end if;
  select role into v_trole from player_roles where player_id = p_target and room_id = p_room;
  if v_trole is null or p_target = v_me then raise exception 'Alvo inválido'; end if;
  perform _log(p_room, _pname(v_me) || ' apontou ' || _pname(p_target) || ' como o Comandante.');
  if v_trole = 'merlin' then
    perform _finish(p_room, 'spies', 'o Assassino encontrou o Comandante');
  else
    perform _finish(p_room, 'resistance', 'o Assassino errou o Comandante');
  end if;
end $$;

create function public.send_message(p_room uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid;
begin
  v_me := _me(p_room);
  if v_me is null then raise exception 'Você não está nesta sala'; end if;
  p_body := btrim(coalesce(p_body, ''));
  if char_length(p_body) < 1 or char_length(p_body) > 300 then raise exception 'Mensagem inválida'; end if;
  insert into messages (room_id, player_id, name, body) values (p_room, v_me, _pname(v_me), p_body);
end $$;

-- permissões: só usuários autenticados (inclui anônimos) chamam as funções públicas
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_member(uuid), public.create_room(text, jsonb), public.join_room(text, text), public.leave_room(uuid),
  public.kick_player(uuid, uuid), public.update_options(uuid, jsonb), public.start_game(uuid), public.reset_room(uuid),
  public.get_my_view(uuid), public.propose_team(uuid, uuid[]), public.cast_vote(uuid, boolean),
  public.play_mission(uuid, boolean), public.assassinate(uuid, uuid), public.send_message(uuid, text)
to authenticated;

-- realtime
alter publication supabase_realtime add table public.rooms, public.players, public.messages;
