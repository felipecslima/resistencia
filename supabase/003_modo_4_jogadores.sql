-- A Resistência — modo de 4 jogadores (rodar depois de 002_correcoes.sql)
-- 4 jogadores: 1 sabotador, equipes de 2, 2, 3, 3 e 3. Empate na votação rejeita a equipe (v_yes * 2 > v_n).

create or replace function public._team_size(n int, r int) returns int
language sql immutable as $$
  select (case n
    when 4 then array[2,2,3,3,3]
    when 5 then array[2,3,2,3,3]
    when 6 then array[2,3,4,3,4]
    when 7 then array[2,3,3,4,4]
    else array[3,4,4,5,5] end)[r]
$$;

create or replace function public._spies(n int) returns int
language sql immutable as $$
  select case when n <= 4 then 1 when n <= 6 then 2 when n <= 9 then 3 else 4 end
$$;

create or replace function public.start_game(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_n int; v_roles text[] := '{}'; v_spies int; v_evil_special int := 0; v_good_special int := 0; v_opts jsonb;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.host_user <> auth.uid() then raise exception 'Apenas o anfitrião pode iniciar'; end if;
  if v_room.phase <> 'lobby' then raise exception 'A partida já começou'; end if;
  select count(*) into v_n from players where room_id = p_room;
  if v_n < 4 then raise exception 'São necessários pelo menos 4 jogadores'; end if;
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
  perform _log(p_room, 'A partida começou com ' || v_n || ' jogadores (' || v_spies || (case when v_spies = 1 then ' espião' else ' espiões' end) || ').');
end $$;

revoke execute on function public.start_game(uuid) from public, anon;
grant execute on function public.start_game(uuid) to authenticated;
