# Merge Conflict — direção de design

> Apenas apresentação. Código, pastas, banco e RPCs continuam como `resistencia` / `resistance` / `spies`.

## Conceito
Um time de devs tenta entregar 5 releases. Alguns são sabotadores plantando bugs. A partida acontece numa **sala de deploy à noite**: mesa redonda de vidro escuro vista de cima, luz âmbar quente de um lado (o time) e ciano frio do outro (o servidor), poeira no feixe, grão de monitor. Conforme a tensão sobe, o calor some e o frio domina.

| Regra (código) | Interface |
|---|---|
| missão | release / build |
| líder propõe equipe | lead abre um PR |
| votação | code review: Approve / Pedir mudanças |
| 5 rejeições | deadline estoura |
| carta Sucesso / Falha | commit limpo / plantar bug → PASSED / FAILED |
| fase assassin | headhunt |

### Papéis (texto de UI)
resistance **Dev** · merlin **Tech Lead** · percival **QA** · spy **Sabotador** · assassin **Headhunter** · morgana **Impostor** · mordred **Zero-day** · oberon **Legado**.

### Nome
1. **Merge Conflict** (escolhido): o conflito é o próprio jogo, curto e reconhecível por devs.
2. Build Quebrado: brasileiro e engraçado, mas fala só da falha.
3. Hotfix: forte como marca, mas sem a ideia de traição.

## Cor (tokens)
```
--bg        #0b0d12
--ink       #eef0f3
--team      oklch(0.85 0.12 195)   ciano · forma: círculo · glifo ✓
--sabotage  oklch(0.72 0.19 22)    coral · forma: losango · glifo ✗
--lead      oklch(0.85 0.14 80)    âmbar · liderança, foco, CTA
--panel     oklch(0.2→0.14 0.015 250) com blur 14px
```
Time e sabotagem nunca dependem só de cor: **círculo vs. losango**, ✓ vs. ✗ e texto ("approve"/"changes", "PASSED"/"FAILED"). Texto sempre ≥ 4.5:1 sobre o painel.

## Tipografia
- **Anybody** (variável, `wdth` 50–150, `wght` 300–900): títulos. O eixo `wdth` é animado na abertura (50→150) e "MERGE / CONFLICT" usa os dois extremos de peso.
- **Atkinson Hyperlegible Next**: corpo, alta legibilidade.
- `ui-monospace` do sistema (sem download) para código, hashes e comandos.

## Movimento
| Token | Curva | Uso |
|---|---|---|
| spring | `cubic-bezier(.34,1.56,.64,1)` 200–380ms | press, hover, nós da mesa |
| out | `cubic-bezier(.16,1,.3,1)` 400–1800ms | fades, luz, vinheta |
| in | `cubic-bezier(.55,0,.75,.2)` 300–460ms | pulsos de voto viajando |
| flip | `cubic-bezier(.3,1.35,.5,1)` 1000–1200ms | cartas |
| físico | mola k=120, c=13 (rAF) | feixe do lead girando até o jogador |

WAAPI para efeitos pontuais (ondas, pulsos, glitch, shake). Transições CSS para estado. Nada de `ease`.

## Momentos cinematográficos
1. **Abertura**: letterbox, `$ git merge --no-ff release/1`, título com o eixo `wdth` abrindo, glitch, aviso "CONFLICT (content): N sabotadores", cartas voando para cada assento, revelação do papel.
2. **Revelação de papel**: carta 5:7 que emerge, vira (1.2s), solta partículas na cor do lado. Foil holográfico em `color-dodge` segue ponteiro ou giroscópio. Número colecionável #01–08.
3. **Montar PR**: fios de luz desenham do hub até cada dev marcado. Ao abrir o PR: som de trava, flash âmbar e onda de choque.
4. **Code review**: um pulso por jogador viaja até o centro (dominó, 360ms) com o placar ao vivo. O veredito entra com mola. Recusa: tremor, estática e onda coral.
5. **Build**: overlay com batida cardíaca acelerando. Commits virados um a um em câmera lenta. FAILED gera glitch cromático, estalo e estática.
6. **Fim**: "SHIP IT" / "PRODUÇÃO CAIU" gigante, `git blame` revelando papéis um a um (sabotadores com glitch), `git log --graph` e o "momento da partida" calculado.
7. **Tensão adaptativa** `t = .12 + rejeições·.13 + falhas·.17 + (rodada−3)·.1 (+.15 em 2×2, +.25 headhunt)`. Afeta vinheta, luz quente/fria, velocidade e agitação das partículas, rotação do hub, filtro, BPM e dissonância da trilha.

## Áudio (WebAudio, sem arquivos) — `mc-engine.js`
- Trilha em camadas: drone desafinado com LFO, sub, pad, chiado de estática, kick com BPM 54→116 e trítono dissonante (tudo dirigido por `t`), blips de terminal aleatórios.
- Stingers: ui, select (escala), lock, vote, pulse (aprovação sobe, rejeição desce), approved, rejected, flip, cardOk, cardFail, success, fail, win, lose, turn, open, deal, reveal (por lado), glitch, heartbeat.
- Barramentos separados de música e efeitos, compressor, mute persistente em `localStorage['mergeconflict.audio']`, suspenso com a aba oculta.
- Háptico (`navigator.vibrate`) em: trava do PR, voto, veredito, commit, falha, revelação e sua vez. Desligado no modo reduzido.

## Acessibilidade
- `aria-live` com fase, veredito e resultado do build. Botões só com ícone têm `aria-label`. Interruptores usam `role="switch"`.
- **Efeitos: completo / reduzido** (botão na mesa, persistido). O padrão segue `prefers-reduced-motion`. No reduzido: sem shake, sem giroscópio e sem tilt, flash ≤ 6% de opacidade, glitch vira fade, partículas ×0.3, flips instantâneos.
- Nenhum flash repetido. Flash único com pico de 26%.
- Alvos ≥ 44px. Funciona a partir de 360px sem rolagem horizontal (a mesa é quadrada e os nós escalam com `clamp`).

## Performance
- Canvas 2D único (sem WebGL, sem libs): ~110 partículas, ou 36 em aparelho fraco (`hardwareConcurrency ≤ 4`, `deviceMemory ≤ 3`, `saveData`, `?low=1`). DPR limitado a 1.5 (1 em aparelho fraco). Grão via pattern 128px. Pausa com `visibilitychange`.
- Efeitos pontuais são elementos efêmeros com WAAPI (compositor: transform/opacity) e removidos ao terminar.
- Orçamento: bundle inicial +≤ 25 kB gz para apresentação. Motor ~6 kB gz. Fontes com `display=swap`.

## Mapeamento para Angular (componentes)
`FxCanvas` (wrapper de `mc-engine.js` FX) · `AudioService` (substitui `SoundService`, mesma API + novos stingers) · `Sigil` (identicon 5×5 espelhado do hash FNV-1a do nome) · `RoleEmblem` · `HoloCard` · `RoundTable` + `LeaderBeam` · `ReleasePipeline` · `VotePulse` · `BuildReveal` · `OpeningSequence` · `PostMortem` · `Icon`. Todos standalone com signals. `game.service.ts` não muda; a tensão é um `computed` no componente a partir de `room()`.

## Galeria
Aba "Galeria" (ou `?gallery=1`), com cenas por `?scene=`: home, lobby, opening, role-{8 papéis}, team, vote-ok, vote-no, build-ok, build-fail, win, lose, tension-0/1/2. Cada cena aparece em 375px e 1280px lado a lado.
