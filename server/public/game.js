/* Erosion — cliente de jogo (vanilla JS, sem dependencias externas). */
(() => {
  "use strict";

  // Metadados de elementos (espelha o servidor) para render.
  const ELEMENT_META = {
    fogo: { label: "Fogo", icon: "🔥", color: "#ff5722" },
    agua: { label: "Água", icon: "💧", color: "#2196f3" },
    planta: { label: "Planta", icon: "🌿", color: "#4caf50" },
    vento: { label: "Vento", icon: "🌪️", color: "#9e9e9e" },
    gelo: { label: "Gelo", icon: "❄️", color: "#00bcd4" },
    raio: { label: "Raio", icon: "⚡", color: "#ffc107" },
    lava: { label: "Lava", icon: "🌋", color: "#e64a19" },
    luz: { label: "Luz", icon: "✨", color: "#fff176" },
    trevas: { label: "Trevas", icon: "🌑", color: "#673ab7" },
  };
  const PHASE_LABEL = {
    lobby: "Lobby", preflop: "Pré-flop", flop: "Flop",
    turn: "Turn", river: "River", showdown: "Showdown", gameover: "Fim",
  };

  // ---------- estado local ----------
  let ws = null;
  let myId = null;
  let roomCode = null;
  let latest = null;
  const selected = new Set(); // ids de tokens selecionados p/ troca

  // ---------- helpers de DOM ----------
  const $ = (id) => document.getElementById(id);
  const show = (screenId) => {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(screenId).classList.add("active");
  };

  function tokenEl(tok, opts = {}) {
    const meta = ELEMENT_META[tok.element] || { icon: "?", color: "#888", label: tok.element };
    const el = document.createElement("div");
    el.className = "token";
    el.style.borderColor = meta.color;
    el.innerHTML =
      `<span class="tier">×${tok.tier}</span>` +
      `<span class="num" style="color:${meta.color}">${tok.value}</span>` +
      `<span class="icon">${meta.icon}</span>`;
    el.title = `${meta.label} ${tok.value} (tier ×${tok.tier})`;
    if (opts.selectable) {
      el.classList.add("selectable");
      if (selected.has(tok.id)) el.classList.add("selected");
      el.addEventListener("click", () => {
        if (selected.has(tok.id)) selected.delete(tok.id);
        else selected.add(tok.id);
        render();
      });
    }
    if (opts.used) el.classList.add("used");
    return el;
  }

  function backEl() {
    const el = document.createElement("div");
    el.className = "token-back";
    return el;
  }

  // ---------- conexao ----------
  function connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.addEventListener("message", onMessage);
    ws.addEventListener("close", () => setTimeout(connect, 1000));
    return new Promise((res) => ws.addEventListener("open", res, { once: true }));
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }

  function onMessage(ev) {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    switch (msg.type) {
      case "joined":
        myId = msg.playerId;
        roomCode = msg.roomCode;
        $("room-code").textContent = roomCode;
        $("g-room-code").textContent = roomCode;
        show("waiting-screen");
        break;
      case "state":
        latest = msg.state;
        render();
        break;
      case "error":
        flashError(msg.message);
        break;
    }
  }

  function flashError(text) {
    const activeErr = document.querySelector(".screen.active .error");
    if (activeErr) {
      activeErr.textContent = text;
      setTimeout(() => { if (activeErr.textContent === text) activeErr.textContent = ""; }, 4000);
    } else {
      $("game-message").textContent = "⚠ " + text;
    }
  }

  // ---------- render ----------
  function render() {
    if (!latest) return;
    const s = latest;

    if (s.phase === "lobby") {
      show("waiting-screen");
      renderPlayerList(s.players);
      renderLivesConfig(s);
      return;
    }

    // No fim de jogo mantemos a mesa visivel ao fundo e sobrepomos o modal
    // de resultado (com todas as estatisticas). O showdown da ultima rodada
    // ja foi exibido antes de chegar aqui.
    show("game-screen");
    $("phase-badge").textContent = PHASE_LABEL[s.phase] || s.phase;
    $("vortex-amount").textContent = s.vortex;
    $("game-message").textContent = s.message || "";

    const me = s.players.find((p) => p.id === myId);
    renderOpponents(s, me);
    renderCommunity(s);
    renderYou(s, me);
    renderActions(s, me);
    renderShowdown(s);

    if (s.phase === "gameover" && s.summary) {
      renderGameOver(s);
    } else {
      $("gameover-modal").classList.add("hidden");
    }
  }

  function renderPlayerList(players) {
    const ul = $("player-list");
    ul.innerHTML = "";
    players.filter((p) => p.connected).forEach((p) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${p.name}${p.id === myId ? " (você)" : ""}</span><span>❤️ ${p.lives}</span>`;
      ul.appendChild(li);
    });
  }

  function renderLivesConfig(s) {
    const isOwner = s.ownerId === myId;
    const input = $("lives-config-input");
    const note = $("lives-config-note");
    const startBtn = $("start-btn");
    // Nao sobrescrever enquanto o dono digita.
    if (document.activeElement !== input) {
      input.value = s.startingLives;
    }
    input.disabled = !isOwner;
    note.textContent = isOwner
      ? "Defina as vidas e inicie quando estiver pronto."
      : "Somente o dono da sala pode alterar as vidas e iniciar.";
    if (startBtn) startBtn.style.display = isOwner ? "" : "none";
  }

  function renderOpponents(s, me) {
    const box = $("opponents");
    box.innerHTML = "";
    s.players.filter((p) => p.id !== myId).forEach((p) => {
      const div = document.createElement("div");
      div.className = "opponent" + (p.isTurn ? " turn" : "") + (p.folded ? " folded" : "");
      const head = document.createElement("div");
      head.className = "opp-head";
      head.innerHTML = `<span class="opp-name">${p.name}</span><span class="opp-lives">❤️ ${p.lives}</span>`;
      div.appendChild(head);

      const meta = document.createElement("div");
      meta.className = "opp-meta";
      meta.innerHTML =
        `<span>Apostado: ${p.committed}</span>` +
        (p.folded ? `<span class="badge-fold">correu</span>` : "") +
        (p.allIn ? `<span class="badge-allin">all-in</span>` : "");
      div.appendChild(meta);

      // mao (back) ou revelada no showdown
      const hand = document.createElement("div");
      hand.className = "tokens-row";
      if (p.hand) {
        p.hand.forEach((t) => hand.appendChild(tokenEl(t, { used: isUsed(s, p, t) })));
      } else {
        for (let i = 0; i < (p.handCount || 0); i++) hand.appendChild(backEl());
      }
      div.appendChild(hand);

      if (p.discards && p.discards.length) {
        const disc = document.createElement("div");
        disc.className = "opp-meta";
        disc.textContent = "Descartes: ";
        p.discards.forEach((t) => {
          const meta2 = ELEMENT_META[t.element];
          disc.textContent += `${meta2.icon}${t.value} `;
        });
        div.appendChild(disc);
      }
      box.appendChild(div);
    });
  }

  function renderCommunity(s) {
    const row = $("community");
    row.innerHTML = "";
    s.community.forEach((t) => row.appendChild(tokenEl(t, { used: isCommunityUsed(s, t) })));
    if (s.community.length === 0) {
      const span = document.createElement("span");
      span.style.color = "var(--muted)";
      span.textContent = "— sem peças comunitárias ainda —";
      row.appendChild(span);
    }
  }

  function renderYou(s, me) {
    if (!me) return;
    $("you-name").textContent = me.name + " (você)";
    $("you-lives").textContent = me.lives;
    $("you-committed").textContent = me.committed;
    $("game-screen").querySelector(".you-area").classList.toggle("turn", !!me.isTurn);

    const row = $("your-hand");
    row.innerHTML = "";
    const canSwap = (s.phase === "preflop" || s.phase === "flop") && !me.folded;
    (me.hand || []).forEach((t) =>
      row.appendChild(tokenEl(t, { selectable: canSwap, used: isUsed(s, me, t) }))
    );

    // controles de troca
    const maxSwaps = s.phase === "preflop" ? 2 : s.phase === "flop" ? 1 : 0;
    const remaining = Math.max(0, maxSwaps - (me.swapsUsed || 0));
    const swapCtl = $("swap-controls");
    if (canSwap && remaining > 0) {
      swapCtl.style.display = "flex";
      $("swap-hint").textContent =
        `Trocas restantes: ${remaining}. Peças descartadas ficam VISÍVEIS para todos. Selecionadas: ${selected.size}.`;
      $("swap-btn").disabled = selected.size === 0 || selected.size > remaining;
    } else {
      swapCtl.style.display = "none";
    }
  }

  function renderActions(s, me) {
    const box = $("actions");
    const myTurn = me && me.isTurn && !me.folded && !me.allIn &&
      ["preflop", "flop", "turn", "river"].includes(s.phase);
    box.classList.toggle("disabled", !myTurn);

    const toCall = me ? s.currentBet - me.committed : 0;
    const checkBtn = box.querySelector('[data-action="check"]');
    const callBtn = box.querySelector('[data-action="call"]');
    checkBtn.style.display = toCall <= 0 ? "" : "none";
    callBtn.style.display = toCall > 0 ? "" : "none";
    callBtn.textContent = `Pagar p/ ver (${toCall})`;
  }

  function renderShowdown(s) {
    const overlay = $("showdown");
    // No gameover o modal de resultado assume; o overlay de showdown
    // so aparece durante a fase de showdown de uma rodada.
    if (s.phase !== "showdown") {
      overlay.classList.add("hidden");
      return;
    }
    overlay.classList.remove("hidden");
    $("showdown-title").textContent = "Showdown";
    const box = $("showdown-results");
    box.innerHTML = "";

    const sd = s.showdown;
    if (sd && sd.scores && sd.scores.length) {
      sd.scores
        .slice()
        .sort((a, b) => b.result.score - a.result.score)
        .forEach((entry) => {
          const p = s.players.find((pl) => pl.id === entry.playerId);
          const won = sd.winners.includes(entry.playerId);
          const div = document.createElement("div");
          div.className = "sd-player" + (won ? " winner" : "");
          const combo = entry.result.element
            ? `${ELEMENT_META[entry.result.element].label} ×${entry.result.tier}: ` +
              entry.result.tokens.map((t) => t.value).join(" + ")
            : "sem combo";
          div.innerHTML =
            `<div class="sd-player-head"><span>${p ? p.name : "?"}${won ? " 👑" : ""}</span>` +
            `<span class="sd-score">${entry.result.score} pts</span></div>` +
            `<div class="sd-combo">${combo}</div>`;
          box.appendChild(div);
        });
    } else if (sd && sd.winners && sd.winners.length) {
      const w = s.players.find((p) => p.id === sd.winners[0]);
      const div = document.createElement("div");
      div.className = "sd-player winner";
      div.innerHTML = `<div class="sd-player-head"><span>${w ? w.name : "?"} 👑</span>` +
        `<span class="sd-score">+${sd.potWon}</span></div>` +
        `<div class="sd-combo">Recuperou as próprias vidas apostadas.</div>`;
      box.appendChild(div);
    }

    $("next-round-btn").textContent = "Próxima rodada";
    $("next-round-btn").disabled = false;
  }

  // destaca os tokens usados no combo (apos showdown)
  function isUsed(s, player, tok) {
    if (!s.showdown || !s.showdown.scores) return false;
    const e = s.showdown.scores.find((x) => x.playerId === player.id);
    return !!(e && e.result.tokens.some((t) => t.id === tok.id));
  }
  function isCommunityUsed(s, tok) {
    if (!s.showdown || !s.showdown.scores) return false;
    return s.showdown.scores.some((e) => e.result.tokens.some((t) => t.id === tok.id));
  }

  // ---------- modal de fim de jogo ----------
  const MEDALS = ["🥇", "🥈", "🥉"];

  // Lista completa de estatisticas (label + como extrair do stats).
  const STAT_FIELDS = [
    { key: "roundsPlayed", label: "Rodadas jogadas", icon: "🎲" },
    { key: "roundsWon", label: "Rodadas vencidas", icon: "🏅" },
    { key: "showdownsReached", label: "Showdowns alcançados", icon: "👁️" },
    { key: "folds", label: "Vezes que correu", icon: "🏳️" },
    { key: "raises", label: "Aumentos", icon: "📈" },
    { key: "allIns", label: "All-ins", icon: "💥" },
    { key: "swaps", label: "Trocas de peça", icon: "🔄" },
    { key: "livesWon", label: "Vidas ganhas", icon: "💚" },
    { key: "livesLost", label: "Vidas apostadas", icon: "💔" },
    { key: "bestCombo", label: "Maior combo", icon: "⚡" },
    { key: "peakLives", label: "Pico de Vidas", icon: "📊" },
  ];

  function renderGameOver(s) {
    const sum = s.summary;
    const modal = $("gameover-modal");

    const champ = sum.ranking.find((r) => r.playerId === sum.championId) || sum.ranking[0];
    const iWon = sum.championId === myId;
    const mine = sum.ranking.find((r) => r.playerId === myId);

    // Palco: emblema + animacao de vitoria/derrota + confete (puro CSS).
    const stage = $("go-stage");
    stage.className = "go-stage " + (iWon ? "go-win" : "go-lose");
    const confetti = iWon
      ? `<div class="go-confetti">${Array.from({ length: 24 })
          .map((_, i) => `<span style="--i:${i}"></span>`)
          .join("")}</div>`
      : "";
    const placeTxt = mine
      ? `Você terminou em ${MEDALS[mine.placement - 1] || mine.placement + "º"} lugar`
      : "";
    stage.innerHTML =
      confetti +
      `<div class="go-emblem">${iWon ? "🏆" : "🌀"}</div>` +
      `<div class="go-headline">${iWon ? "Vitória!" : "Fim de Jogo"}</div>` +
      `<p class="go-sub">Campeão: <strong>${champ ? champ.name : "—"}</strong>` +
      ` · ${sum.totalRounds} rodada${sum.totalRounds === 1 ? "" : "s"}</p>` +
      (placeTxt ? `<p class="go-place">${placeTxt}</p>` : "");

    // Classificacao completa (todos os jogadores, por colocacao).
    const rankBox = $("go-ranking");
    rankBox.innerHTML = "";
    sum.ranking.forEach((r, i) => {
      const medal = MEDALS[r.placement - 1] || `${r.placement}º`;
      const statusTxt = r.survived
        ? "Sobreviveu"
        : `Eliminado · rodada ${r.eliminatedRound ?? "?"}`;
      const row = document.createElement("div");
      row.className =
        "go-rank-row" +
        (r.placement === 1 ? " champ" : "") +
        (r.playerId === myId ? " me" : "") +
        (r.survived ? "" : " out");
      row.style.setProperty("--d", `${i * 90}ms`);
      row.innerHTML =
        `<span class="go-rank-pos">${medal}</span>` +
        `<span class="go-rank-name">${r.name}${r.playerId === myId ? " (você)" : ""}</span>` +
        `<span class="go-rank-info">❤️ ${r.lives} · ${statusTxt}</span>`;
      rankBox.appendChild(row);
    });

    // Destaques da partida.
    const hi = sum.highlights;
    const hiBox = $("go-highlights");
    hiBox.innerHTML = "";
    const hiCards = [
      hi.biggestCombo
        ? { icon: "⚡", title: `Maior combo — ${hi.biggestCombo.name}`, value: `${hi.biggestCombo.value} pts` }
        : null,
      hi.mostAggressive
        ? { icon: "🔥", title: `Mais agressivo — ${hi.mostAggressive.name}`, value: `${hi.mostAggressive.raises} aumentos` }
        : null,
      hi.mostRoundsWon
        ? { icon: "🏅", title: `Mais rodadas — ${hi.mostRoundsWon.name}`, value: `${hi.mostRoundsWon.rounds} vitórias` }
        : null,
    ].filter(Boolean);
    if (hiCards.length === 0) {
      hiBox.innerHTML = `<p class="go-place">Sem destaques nesta partida.</p>`;
    } else {
      hiCards.forEach((c, i) => {
        const div = document.createElement("div");
        div.className = "go-badge";
        div.style.setProperty("--d", `${i * 120}ms`);
        div.innerHTML =
          `<span class="go-badge-icon">${c.icon}</span>` +
          `<span class="go-badge-title">${c.title}</span>` +
          `<span class="go-badge-val">${c.value}</span>`;
        hiBox.appendChild(div);
      });
    }

    // Suas estatisticas completas (grid).
    const myBox = $("go-mystats");
    myBox.innerHTML = "";
    if (mine) {
      STAT_FIELDS.forEach((f) => {
        const val = mine.stats[f.key] ?? 0;
        const cell = document.createElement("div");
        cell.className = "go-stat";
        cell.innerHTML =
          `<span class="go-stat-val">${f.icon} ${val}</span>` +
          `<span class="go-stat-label">${f.label}</span>`;
        myBox.appendChild(cell);
      });
    } else {
      myBox.innerHTML = `<p class="go-place">Você não participou desta partida.</p>`;
    }

    modal.classList.remove("hidden");
  }

  // ---------- tutorial interativo ----------
  // Cria um "token" de exemplo (sem interacao) reutilizando o visual do jogo.
  function demoToken(element, value, tier) {
    return tokenEl({ id: "demo", element, value, tier }).outerHTML;
  }

  const TUT_STEPS = [
    {
      title: "O Vórtice e a Energia",
      body: `
        <span class="tut-emoji">🌀</span>
        <p>Em Erosion você gerencia <span class="hl">energia</span>. Cada jogador começa
        com <span class="hl">Vidas</span> e o objetivo é esgotar as dos oponentes.</p>
        <p>Sempre que você aposta, suas Vidas vão para o centro da mesa — o
        <span class="hl">Vórtice Elemental</span>. Quem tiver o melhor combo no fim leva tudo.</p>
        <ul>
          <li>Perdeu todas as Vidas? Você está <b>fora</b> da partida.</li>
          <li>Último jogador de pé (ou maior combo no showdown) <b>vence</b>.</li>
        </ul>`,
    },
    {
      title: "Seu Arsenal — os Tokens",
      body: `
        <p>As peças vêm de um saco com valores de <span class="hl">1 a 10</span>. Cada peça tem um
        <span class="hl">elemento</span> e um <span class="hl">tier</span> (multiplicador), que define
        sua raridade e seu poder.</p>
        <div class="tut-tiers">
          <div class="tut-tier">
            <h4>Tier <span class="mult">×1</span></h4>
            <p>Base sólida. 3 cópias de cada número. Fáceis de combinar.</p>
          </div>
          <div class="tut-tier">
            <h4>Tier <span class="mult">×2</span></h4>
            <p>Risco calculado. 2 cópias de cada. Dobram seus pontos.</p>
          </div>
          <div class="tut-tier">
            <h4>Tier <span class="mult">×3</span></h4>
            <p>Lendas cósmicas. 1 única peça de cada número. Triplicam!</p>
          </div>
        </div>
        <div class="tut-tokens">
          ${demoToken("agua", 10, 1)}
          ${demoToken("raio", 8, 2)}
          ${demoToken("trevas", 7, 3)}
        </div>`,
    },
    {
      title: "A Batalha — fases da rodada",
      body: `
        <p>Primeiro, cada jogador paga o <span class="hl">ingresso</span> (1 Vida ao Vórtice) e
        puxa <span class="hl">4 peças</span> secretas. A rodada avança em fases:</p>
        <ul>
          <li><b>Pré-flop</b> — apostas iniciais. Pode trocar até <b>2 peças</b> (o descarte fica à vista!).</li>
          <li><b>Flop</b> — 3 peças comunitárias na mesa. Nova aposta. Última troca: <b>1 peça</b>.</li>
          <li><b>Turn</b> — mais 2 comunitárias (5 no total). Trocas <b>encerradas</b>.</li>
          <li><b>River</b> — a 6ª e última comunitária. Aposta final.</li>
          <li><b>Showdown</b> — a hora da verdade: calcula-se os combos.</li>
        </ul>
        <p>Dica: as peças descartadas ficam <span class="hl">viradas para cima</span> — leia o blefe dos outros!</p>`,
    },
    {
      title: "Suas ações na aposta",
      body: `
        <p>No seu turno você escolhe uma ação:</p>
        <div class="tut-actions-grid">
          <div class="tut-action"><span class="name">Check</span><small>Passa sem apostar (se ninguém aumentou).</small></div>
          <div class="tut-action"><span class="name call">Pagar p/ ver</span><small>Iguala a aposta atual e continua na mão.</small></div>
          <div class="tut-action"><span class="name raise">Aumentar</span><small>Sobe a aposta (até o dobro do último jogador).</small></div>
          <div class="tut-action"><span class="name allin">All-In</span><small>Joga todas as Vidas de uma vez. Sem volta!</small></div>
          <div class="tut-action"><span class="name fold">Correr</span><small>Desiste da mão e perde o que já apostou.</small></div>
        </div>`,
    },
    {
      title: "Como pontuar",
      body: `
        <p>No showdown, monte o melhor combo juntando <span class="hl">sua mão</span> com as
        <span class="hl">peças da mesa</span>. A matemática é simples:</p>
        <ul>
          <li>1. Escolha até <b>3 peças do MESMO elemento</b>.</li>
          <li>2. <b>Some</b> os valores numéricos.</li>
          <li>3. <b>Multiplique</b> pelo tier do elemento (×1, ×2 ou ×3).</li>
        </ul>
        <div class="tut-tokens">
          ${demoToken("trevas", 10, 3)}
          ${demoToken("trevas", 7, 3)}
        </div>
        <div class="tut-calc">
          <div class="formula">(10 + 7) × 3</div>
          <div class="result">= 51 pontos 🏆</div>
        </div>
        <p>Duas peças lendárias de Trevas atropelam um combo enorme de Tier 1!</p>`,
    },
    {
      title: "Pronto para jogar!",
      body: `
        <span class="tut-emoji">⚔️</span>
        <p>Para jogar com um amigo:</p>
        <ul>
          <li>1. Clique em <b>Criar sala</b> — você recebe um código de 4 letras.</li>
          <li>2. Abra <b>outro navegador</b> (ou aba), digite o código e entre.</li>
          <li>3. Cada navegador é um jogador. Clique em <b>Iniciar partida</b>!</li>
        </ul>
        <p class="hl">Que a sorte do saco esteja com você. 🌀</p>`,
    },
  ];

  let tutIndex = 0;

  function renderTutorial() {
    const step = TUT_STEPS[tutIndex];
    $("tut-stage").innerHTML = `<div class="tut-step"><h3>${step.title}</h3>${step.body}</div>`;

    // barra de progresso
    const pct = ((tutIndex + 1) / TUT_STEPS.length) * 100;
    $("tut-progress-bar").style.width = pct + "%";

    // dots
    const dots = TUT_STEPS.map((_, i) => {
      const cls = i === tutIndex ? "tut-dot active" : i < tutIndex ? "tut-dot done" : "tut-dot";
      return `<span class="${cls}" data-step="${i}"></span>`;
    }).join("");
    $("tut-dots").innerHTML = dots;
    $("tut-dots").querySelectorAll(".tut-dot").forEach((d) => {
      d.addEventListener("click", () => { tutIndex = Number(d.dataset.step); renderTutorial(); });
    });

    // navegacao
    $("tut-counter").textContent = `${tutIndex + 1} / ${TUT_STEPS.length}`;
    $("tut-prev").disabled = tutIndex === 0;
    $("tut-next").textContent = tutIndex === TUT_STEPS.length - 1 ? "Começar a jogar ✓" : "Avançar →";
  }

  function openTutorial() { tutIndex = 0; renderTutorial(); show("tutorial-screen"); }
  function closeTutorial() { show("lobby-screen"); }

  // ---------- eventos de UI ----------
  $("create-btn").addEventListener("click", async () => {
    await ensureConnected();
    const lives = Number($("lives-input").value) || 20;
    send({ type: "create", name: $("name-input").value, startingLives: lives });
  });
  $("join-btn").addEventListener("click", async () => {
    const code = $("code-input").value.trim().toUpperCase();
    if (!code) return flashError("Informe o código da sala.");
    await ensureConnected();
    send({ type: "join", roomCode: code, name: $("name-input").value });
  });
  $("start-btn").addEventListener("click", () => send({ type: "start" }));

  // avancar para a proxima rodada (ou encerrar a partida -> gameover)
  $("next-round-btn").addEventListener("click", () => send({ type: "nextRound" }));

  // dono ajusta as vidas na sala de espera
  $("lives-config-input").addEventListener("change", () => {
    const lives = Number($("lives-config-input").value);
    if (!Number.isFinite(lives)) return;
    send({ type: "config", startingLives: lives });
  });

  // nova partida (recarrega para voltar ao lobby)
  $("go-newgame-btn").addEventListener("click", () => location.reload());

  // trocar peças selecionadas
  $("swap-btn").addEventListener("click", () => {
    const tokenIds = Array.from(selected);
    if (tokenIds.length === 0) return;
    send({ type: "swap", tokenIds });
    selected.clear();
  });

  // tutorial
  $("tutorial-btn").addEventListener("click", openTutorial);
  $("tut-close").addEventListener("click", closeTutorial);
  $("tut-prev").addEventListener("click", () => {
    if (tutIndex > 0) { tutIndex--; renderTutorial(); }
  });
  $("tut-next").addEventListener("click", () => {
    if (tutIndex < TUT_STEPS.length - 1) { tutIndex++; renderTutorial(); }
    else closeTutorial();
  });

  document.querySelectorAll(".actions .act").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      const amount = action === "raise" ? Number($("raise-amount").value) || 1 : 0;
      send({ type: "bet", action, amount });
    });
  });

  async function ensureConnected() {
    if (!ws || ws.readyState !== WebSocket.OPEN) await connect();
  }

  // conecta ao carregar
  connect();
})();
