-- A Resistência — correções sobre 001_resistencia.sql (rodar depois dele)

-- kick: valida o alvo antes de registrar (evita entrada nula no log em clique duplo ou id de outra sala)
create or replace function public.kick_player(p_room uuid, p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_room rooms; v_name text;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.host_user <> auth.uid() then raise exception 'Apenas o anfitrião pode remover jogadores'; end if;
  if v_room.phase <> 'lobby' then raise exception 'Só é possível remover no lobby'; end if;
  if p_player = _me(p_room) then raise exception 'Você não pode remover a si mesmo'; end if;
  delete from players where id = p_player and room_id = p_room returning name into v_name;
  if v_name is null then return; end if;
  perform _log(p_room, v_name || ' foi removido da sala.');
end $$;

-- equipe: grava os ids sem repetição (antes [a,a,b] passava na validação e era gravado assim)
create or replace function public.propose_team(p_room uuid, p_team uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_me uuid; v_leader uuid; v_n int; v_size int; v_names text; v_team uuid[];
begin
  select * into v_room from rooms where id = p_room for update;
  if not found then raise exception 'Sala não encontrada'; end if;
  v_me := _me(p_room);
  select id into v_leader from players where room_id = p_room and seat = v_room.leader_seat;
  if v_room.phase <> 'team' then raise exception 'Não é hora de montar a equipe'; end if;
  if v_me is distinct from v_leader then raise exception 'Apenas o líder monta a equipe'; end if;
  select count(*) into v_n from players where room_id = p_room;
  v_size := _team_size(v_n, v_room.round);
  v_team := array(select distinct x from unnest(p_team) x where x is not null);
  if coalesce(array_length(v_team, 1), 0) <> v_size then raise exception 'A equipe precisa ter % jogadores', v_size; end if;
  if (select count(*) from players where room_id = p_room and id = any(v_team)) <> v_size then raise exception 'Jogador inválido na equipe'; end if;
  delete from team_votes where room_id = p_room;
  update rooms set team = v_team, phase = 'vote', voted = '{}' where id = p_room;
  select string_agg(name, ', ' order by seat) into v_names from players where id = any(v_team);
  perform _log(p_room, _pname(v_me) || ' propôs a equipe: ' || v_names || '.');
end $$;

-- início: só compacta os assentos quando há buracos (evita 2 updates por jogador a cada partida)
create or replace function public.start_game(p_room uuid) returns void
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

  -- compacta os assentos 0..n-1 (dois passos para respeitar a unique); assentos são únicos e >= 0,
  -- então max = n-1 significa que já estão contíguos
  if (select max(seat) from players where room_id = p_room) <> v_n - 1 then
    update players set seat = seat + 1000 where room_id = p_room;
    update players p set seat = s.rn - 1 from (
      select id, row_number() over (order by seat) as rn from players where room_id = p_room
    ) s where p.id = s.id;
  end if;

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

-- create or replace mantém os grants, mas reafirma por segurança
revoke execute on function public.kick_player(uuid, uuid), public.propose_team(uuid, uuid[]), public.start_game(uuid) from public, anon;
grant execute on function public.kick_player(uuid, uuid), public.propose_team(uuid, uuid[]), public.start_game(uuid) to authenticated;
