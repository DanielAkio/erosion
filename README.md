# 🌪️ Erosion

> **Blefe, Sorte e Cálculo.** Um jogo de cartas elemental estilo pôquer, jogável no navegador, offline e em multiplayer local.

![Plataforma](https://img.shields.io/badge/plataforma-navegador-blue)
![Offline](https://img.shields.io/badge/offline-100%25%20sem%20CDN-success)
![Infra](https://img.shields.io/badge/infra-docker--compose-informational)
![Stack](https://img.shields.io/badge/stack-Node%20%7C%20TypeScript%20%7C%20WebSocket-brightgreen)

**Erosion** é um jogo de **tokens elementais** inspirado no pôquer, onde a tensão psicológica do blefe encontra a matemática viciante dos combos. Dois (ou mais) jogadores abrem o jogo em **navegadores diferentes** — cada navegador é um *player* — e o estado é sincronizado em tempo real via **WebSocket**. Toda a infraestrutura sobe com **um único comando** via Docker Compose e roda **100% offline**, sem nenhuma dependência de CDN.
 
---

## 🎯 Objetivo

Manter suas **Vidas** a salvo enquanto a energia dos adversários se esgota (sofre *erosão*). Sempre que você aposta, suas Vidas vão para o centro da mesa — o **Vórtice Elemental**. Quem fechar o melhor combo no **Showdown** leva tudo o que foi acumulado. O último jogador com Vidas em pé vence a partida.

> 🔧 O **dono da sala** pode configurar quantas Vidas cada jogador começa.

---

## 🎒 O Arsenal — O Saco de Tokens

Um saco com **200 peças táticas**. Cada token tem um **valor de 1 a 10** e pertence a um **elemento**, cuja raridade é definida pelo **Tier** (multiplicador):

| Tier | Multiplicador | Cópias por número | Descrição |
|------|---------------|-------------------|-----------|
| **Tier 1** | ×1 | 3 idênticas | A Base Sólida — fáceis de achar, ideais para combos grandes. |
| **Tier 2** | ×2 | 2 idênticas | O Risco Calculado — exigem sorte, mas **dobram** os pontos. |
| **Tier 3** | ×3 | 1 única no saco | As Lendas Cósmicas — raríssimas e **triplicam** a pontuação. |

**Elementos:** Fogo, Água, Raio, Lava, Luz, Trevas, Planta, Vento e Gelo.

---

## ⚔️ Fluxo da Rodada

1. **🩸 Ingresso (Pingo):** cada jogador coloca **1 Vida** no Vórtice (ante).
2. **🃏 Início:** cada jogador puxa **4 tokens** (mão secreta). Rodada de apostas. É possível **trocar até 2 tokens** — o descarte fica **virado para cima**, revelando pistas aos adversários (o *blefe físico*).
3. **🀄 Turno 1 (flop):** 3 tokens comunitários na mesa. Apostas. Última troca de **1 token**.
4. **🔒 Turno 2 (turn):** +2 comunitários (5 no total). Apostas. **Fim das trocas.**
5. **🏁 Turno 3 (river):** +1 comunitário (6 no total). Rodada final de apostas.
6. **👁️ Showdown:** comparam-se os combos. Maior pontuação leva o Vórtice; empate divide o pote.

**Ações de aposta:** pagar para ver (*call*), aumentar (*raise*, até o dobro do último), correr (*fold*) ou *all-in*.

---

## 🧮 Pontuação

1. Escolha **até 3 tokens do MESMO elemento** (combinando mão + mesa).
2. **Some** os valores.
3. **Multiplique** pelo **Tier** do elemento.

**Exemplos:**

- 🌊 **Tier 1 (Água):** `10 + 9 + 8 = 27` → ×1 → **27 pontos**
- ⚡ **Tier 2 (Raio):** `8 + 6 + 5 = 19` → ×2 → **38 pontos**
- 🌑 **Tier 3 (Trevas):** `10 + 7 = 17` → ×3 → **51 pontos**

> 💡 Uma única peça Tier 3 alta (ex.: Trevas 7 = 21 pts) já pode bagaçar a mesa inteira. Peça lendária na mão inicial? Vale o blefe!

---

## 🚀 Como rodar (Docker Compose)

Sobe toda a infraestrutura com um único comando:

```bash
docker compose up --build
```

Depois abra **dois navegadores** (ou duas janelas anônimas) em:

- **http://localhost:8080**

Crie uma sala em um navegador, copie o **código** e entre com o segundo navegador. Esse comando funciona no Linux, macOS e Windows com Docker Desktop e Docker Compose v2 instalados.

> Se a porta 8080 estiver ocupada, no PowerShell use `$env:HOST_PORT=9090` e depois `docker compose up --build`. No Prompt de Comando, use `set HOST_PORT=9090` e depois `docker compose up --build`. No Linux/macOS, use `HOST_PORT=9090 docker compose up --build`.

---

## 🛠️ Desenvolvimento local (sem Docker)

Instale o Node.js 20 ou superior (que inclui o npm) e então execute:

```bash
cd server
npm install
npm run dev
```

No PowerShell, entre na pasta com `Set-Location server` antes de executar os comandos npm.

Para build de produção:

```bash
cd server
npm run build
node dist/index.js   # usa PORT (padrão 8080)
```

Healthcheck: `GET /health` → `{"ok":true}`.

---

## 📦 Estrutura do projeto

```
erosion/
├── docker-compose.yml      # sobe toda a infra com um comando
├── DESCRICAO.md            # descrição detalhada do jogo e das regras
├── regras.txt              # regras oficiais (OCR do PDF)
├── server/                 # Node + TypeScript + Express + ws (servidor autoritativo)
│   ├── Dockerfile
│   ├── src/
│   │   ├── game/           # motor do jogo (tokens, pontuação, estado, rodadas)
│   │   ├── net/            # salas e protocolo WebSocket
│   │   └── index.ts        # servidor HTTP + WS
│   └── public/             # client estático (HTML/CSS/JS vanilla, offline)
└── tools/                  # utilitários (OCR do PDF de regras)
```

---

## 🧩 Características técnicas

- **🌐 Roda no navegador** — client em JavaScript vanilla, leve e responsivo.
- **📴 100% offline** — todos os assets são vendorizados; nenhuma CDN.
- **🐳 Infra via Docker Compose** — tudo sobe com `docker compose up --build`.
- **👥 Multiplayer local** — dois ou mais navegadores, cada um é um jogador (WebSocket).
- **🔒 Servidor autoritativo** — o motor `GameEngine` valida todas as jogadas e envia a cada cliente apenas a visão permitida do estado.

---

📖 Para a descrição completa das regras, estratégias e estatísticas, veja [`DESCRICAO.md`](./DESCRICAO.md).

*Erosion: onde cada peça puxada do saco pode ser o começo de uma lenda — ou o fim das suas Vidas.* 🌪️
