# A Resistência — multiplayer em tempo real

Jogo de dedução social (estilo The Resistance) para 5 a 10 jogadores.
Angular 22 (standalone, zoneless, Signals) + Supabase (Auth anônimo, Postgres com RLS, Realtime).

## Passo obrigatório no Supabase

O projeto `resistencia-game` já foi criado e o schema aplicado. Falta ligar o login anônimo:

Dashboard > Authentication > Sign In / Providers > **Allow anonymous sign-ins**

## Rodar

```bash
cd web
npm install
npm start        # http://localhost:4200
```

Para testar sozinho, abra a sala em abas anônimas/navegadores diferentes (cada um é um jogador).
Link de convite: `http://localhost:4200/?sala=CODIGO`.

## Deploy

`npm run build` gera `web/dist/app/browser`, que é estático (Vercel, Netlify, Cloudflare Pages).

## Como o jogo é protegido contra trapaça

- Papéis ficam em `player_roles`, votos em `team_votes` e cartas em `mission_cards`: tabelas **sem policy de leitura**.
- Todas as ações são funções `security definer` (`supabase/001_resistencia.sql`) que validam fase, líder e papel.
- O cliente só vê o próprio papel (e o que ele tem direito de saber) via `get_my_view`.
- Votos e cartas só aparecem quando todos terminam; a missão revela apenas a quantidade de falhas.

## Recursos

Salas com código, lobby com chat, 5 a 10 jogadores, Comandante/Assassino, Vigia/Impostora, Mordred, Oberon,
histórico de votos, registro da partida, reconexão automática (volta para a sala ao recarregar), indicador online,
animações de revelação, sons (sintetizados, sem arquivos) e aviso "Sua vez" no título da aba.

## Limpeza de salas antigas

Salas não são apagadas automaticamente. Para limpar (pg_cron ou manualmente):
`delete from rooms where created_at < now() - interval '2 days';`
