/**
 * Motor autoritativo do jogo Erosion.
 *
 * Mantem o estado completo de uma partida e aplica acoes dos jogadores,
 * validando-as. O servidor instancia uma GameEngine por sala.
 */
import { buildBag, shuffle, type Token } from "./tokens.js";
import { bestScore, type ScoreResult } from "./scoring.js";

export type Phase =
  | "lobby" // aguardando jogadores / inicio da rodada
  | "preflop" // mao de 4, 1a aposta (troca ate 2)
  | "flop" // 3 comunitarios, aposta (troca ate 1)
  | "turn" // +2 comunitarios, aposta
  | "river" // +1 comunitario, aposta final
  | "showdown" // revela e distribui o vortice
  | "gameover"; // alguem sem vidas

export type BetAction = "call" | "raise" | "fold" | "check" | "allin";

/** Estatisticas acumuladas de um jogador ao longo da partida. */
export interface PlayerStats {
  roundsPlayed: number; // rodadas em que participou (nao estava fora no inicio)
  roundsWon: number; // showdowns/potes levados
  showdownsReached: number; // chegou ate o showdown (nao correu)
  folds: number; // vezes que correu
  allIns: number; // vezes que foi all-in
  raises: number; // vezes que aumentou
  swaps: number; // trocas feitas no total
  livesWon: number; // total de Vidas ganhas do Vortice
  livesLost: number; // total de Vidas colocadas no Vortice (apostadas)
  bestCombo: number; // maior combo pontuado em um showdown
  peakLives: number; // pico de Vidas durante a partida
  eliminatedRound: number | null; // rodada em que foi eliminado (null = sobreviveu)
  placement: number | null; // colocacao final (1 = campeao)
}

export interface PlayerState {
  id: string;
  name: string;
  lives: number; // Vidas restantes
  hand: Token[]; // mao secreta (4 tokens)
  committed: number; // vidas apostadas nesta rodada
  folded: boolean;
  allIn: boolean;
  connected: boolean;
  swapsUsed: number; // trocas usadas na fase atual
  acted: boolean; // ja agiu na rodada de apostas atual
  discards: Token[]; // tokens descartados (visiveis p/ todos)
  stats: PlayerStats; // estatisticas acumuladas
}

export interface GameState {
  roomCode: string;
  ownerId: string | null; // dono da sala (primeiro jogador que entrou)
  phase: Phase;
  players: PlayerState[];
  community: Token[]; // tokens comunitarios na mesa
  vortex: number; // pote central
  currentBet: number; // aposta a igualar na rodada atual
  turnIndex: number; // indice do jogador da vez
  dealerIndex: number;
  lastRaiseAmount: number; // para limitar raise ao dobro
  startingLives: number;
  showdown: ShowdownResult | null;
  message: string;
  roundNumber: number; // rodada atual (1-based)
  summary: GameOverSummary | null; // resumo final (preenchido no gameover)
}

export interface ShowdownResult {
  scores: { playerId: string; result: ScoreResult }[];
  winners: string[];
  potWon: number;
}

/** Resumo final da partida, com ranking e destaques. */
export interface GameOverSummary {
  championId: string | null;
  totalRounds: number;
  ranking: {
    playerId: string;
    name: string;
    placement: number; // 1 = campeao
    lives: number;
    survived: boolean;
    eliminatedRound: number | null;
    stats: PlayerStats;
  }[];
  highlights: {
    biggestCombo: { playerId: string; name: string; value: number } | null;
    mostAggressive: { playerId: string; name: string; raises: number } | null;
    mostRoundsWon: { playerId: string; name: string; rounds: number } | null;
  };
}

const ANTE = 1; // pingo
const HAND_SIZE = 4;
const START_LIVES = 20;
const MIN_LIVES = 5;
const MAX_LIVES = 100;

export class GameEngine {
  private bag: Token[] = [];
  state: GameState;

  constructor(roomCode: string, startingLives = START_LIVES) {
    this.state = {
      roomCode,
      ownerId: null,
      phase: "lobby",
      players: [],
      community: [],
      vortex: 0,
      currentBet: 0,
      turnIndex: 0,
      dealerIndex: 0,
      lastRaiseAmount: 0,
      startingLives: GameEngine.clampLives(startingLives),
      showdown: null,
      message: "Aguardando jogadores...",
      roundNumber: 1,
      summary: null,
    };
  }

  /** Limita as vidas iniciais ao intervalo permitido. */
  static clampLives(n: number): number {
    if (!Number.isFinite(n)) return START_LIVES;
    return Math.max(MIN_LIVES, Math.min(MAX_LIVES, Math.round(n)));
  }

  /**
   * Define as vidas iniciais. So e permitido no lobby (antes de comecar)
   * e apenas pelo dono da sala. Reajusta as vidas dos jogadores ja presentes.
   */
  setStartingLives(playerId: string, n: number): string | null {
    if (this.state.phase !== "lobby") return "A partida já começou.";
    if (this.state.ownerId && this.state.ownerId !== playerId) {
      return "Apenas o dono da sala pode alterar as vidas.";
    }
    const lives = GameEngine.clampLives(n);
    this.state.startingLives = lives;
    for (const p of this.state.players) p.lives = lives;
    return null;
  }

  // ---------- gestao de jogadores ----------

  addPlayer(id: string, name: string): PlayerState {
    const player: PlayerState = {
      id,
      name,
      lives: this.state.startingLives,
      hand: [],
      committed: 0,
      folded: false,
      allIn: false,
      connected: true,
      swapsUsed: 0,
      acted: false,
      discards: [],
      stats: {
        roundsPlayed: 0,
        roundsWon: 0,
        showdownsReached: 0,
        folds: 0,
        allIns: 0,
        raises: 0,
        swaps: 0,
        livesWon: 0,
        livesLost: 0,
        bestCombo: 0,
        peakLives: 0,
        eliminatedRound: null,
        placement: null,
      },
    };
    this.state.players.push(player);
    if (!this.state.ownerId) this.state.ownerId = id;
    return player;
  }

  removePlayer(id: string): void {
    const p = this.getPlayer(id);
    if (p) p.connected = false;
  }

  getPlayer(id: string): PlayerState | undefined {
    return this.state.players.find((p) => p.id === id);
  }

  // ---------- ciclo da rodada ----------

  startRound(): void {
    const alive = this.state.players.filter((p) => p.lives > 0);
    if (alive.length < 2) {
      this.state.phase = "gameover";
      this.state.message = "Jogo encerrado. Vencedor definido.";
      return;
    }

    // Numero da rodada: 1 na primeira, incrementa nas seguintes.
    const alreadyPlayed = this.state.players.some((p) => p.stats.roundsPlayed > 0);
    if (alreadyPlayed) this.state.roundNumber++;

    this.bag = shuffle(buildBag());
    this.state.community = [];
    this.state.vortex = 0;
    this.state.currentBet = 0;
    this.state.lastRaiseAmount = 0;
    this.state.showdown = null;

    // Estatisticas: conta participacao e registra pico de Vidas.
    for (const p of this.state.players) {
      if (p.lives > 0) {
        p.stats.roundsPlayed++;
        if (p.lives > p.stats.peakLives) p.stats.peakLives = p.lives;
      }
    }

    for (const p of this.state.players) {
      p.hand = [];
      p.committed = 0;
      p.folded = p.lives <= 0; // sem vidas = fora
      p.allIn = false;
      p.swapsUsed = 0;
      p.acted = false;
      p.discards = [];
    }

    // Pingo (ante): cada jogador vivo coloca 1 Vida no vortice.
    for (const p of this.state.players) {
      if (p.lives > 0) {
        const ante = Math.min(ANTE, p.lives);
        p.lives -= ante;
        p.committed += ante;
        this.state.vortex += ante;
      }
    }
    this.state.currentBet = ANTE;

    // Distribui 4 tokens a cada jogador vivo.
    for (const p of this.state.players) {
      if (p.lives >= 0 && !p.folded) {
        p.hand = this.draw(HAND_SIZE);
      }
    }

    // Dealer e turno
    this.state.dealerIndex =
      (this.state.dealerIndex + 1) % this.state.players.length;
    this.state.turnIndex = this.firstActiveFrom(this.state.dealerIndex);
    this.state.phase = "preflop";
    this.state.message = "Pré-flop: façam suas apostas.";
  }

  private draw(n: number): Token[] {
    return this.bag.splice(0, n);
  }

  private firstActiveFrom(start: number): number {
    const n = this.state.players.length;
    for (let i = 0; i < n; i++) {
      const idx = (start + 1 + i) % n;
      const p = this.state.players[idx];
      if (!p.folded && !p.allIn && p.lives >= 0) return idx;
    }
    return start;
  }

  // ---------- acoes de aposta ----------

  bet(playerId: string, action: BetAction, amount = 0): string | null {
    const idx = this.state.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return "Jogador inexistente.";
    if (idx !== this.state.turnIndex) return "Não é sua vez.";
    const p = this.state.players[idx];
    if (p.folded || p.allIn) return "Você não pode agir agora.";
    if (!this.isBettingPhase()) return "Não é hora de apostar.";

    const toCall = this.state.currentBet - p.committed;

    switch (action) {
      case "fold":
        p.folded = true;
        p.stats.folds++;
        break;

      case "check":
        if (toCall > 0) return "Há aposta a pagar; não é possível dar check.";
        break;

      case "call": {
        const pay = Math.min(toCall, p.lives);
        p.lives -= pay;
        p.committed += pay;
        this.state.vortex += pay;
        p.stats.livesLost += pay;
        if (p.lives === 0) p.allIn = true;
        break;
      }

      case "raise": {
        // raise ate o dobro da ultima aposta (regra "ate o dobro")
        const minRaise = Math.max(1, this.state.lastRaiseAmount || ANTE);
        const maxRaise = Math.max(minRaise, (this.state.lastRaiseAmount || ANTE) * 2);
        const raiseBy = Math.max(minRaise, Math.min(amount, maxRaise));
        const total = toCall + raiseBy;
        if (total > p.lives) return "Vidas insuficientes para esse aumento.";
        p.lives -= total;
        p.committed += total;
        this.state.vortex += total;
        p.stats.livesLost += total;
        p.stats.raises++;
        this.state.currentBet = p.committed;
        this.state.lastRaiseAmount = raiseBy;
        // Reabre a rodada: todos os demais precisam reagir.
        for (const other of this.state.players) {
          if (other.id !== p.id && !other.folded && !other.allIn) {
            other.acted = false;
          }
        }
        if (p.lives === 0) p.allIn = true;
        break;
      }

      case "allin": {
        const pay = p.lives;
        p.lives = 0;
        p.committed += pay;
        this.state.vortex += pay;
        p.allIn = true;
        p.stats.allIns++;
        p.stats.livesLost += pay;
        if (p.committed > this.state.currentBet) {
          this.state.lastRaiseAmount = p.committed - this.state.currentBet;
          this.state.currentBet = p.committed;
          for (const other of this.state.players) {
            if (other.id !== p.id && !other.folded && !other.allIn) {
              other.acted = false;
            }
          }
        }
        break;
      }
    }

    p.acted = true;
    this.advanceTurn();
    return null;
  }

  private isBettingPhase(): boolean {
    return ["preflop", "flop", "turn", "river"].includes(this.state.phase);
  }

  private contenders(): PlayerState[] {
    return this.state.players.filter((p) => !p.folded && p.lives >= 0 && (p.committed > 0 || p.hand.length > 0));
  }

  private activeBettors(): PlayerState[] {
    return this.state.players.filter((p) => !p.folded && !p.allIn);
  }

  private advanceTurn(): void {
    // Se só resta 1 jogador que não desistiu -> ele leva o vortice (sem showdown).
    const notFolded = this.state.players.filter((p) => !p.folded && (p.hand.length > 0 || p.committed > 0));
    if (notFolded.length <= 1) {
      this.finishByFold(notFolded[0]);
      return;
    }

    const active = this.activeBettors();

    // Se nenhum jogador (ou apenas um) ainda pode apostar -> ninguém mais tem
    // decisões a tomar. É o caso típico de all-in: as apostas acabaram, mas a
    // rodada NÃO termina aqui. Corremos todas as peças comunitárias restantes
    // e vamos ao showdown, onde o Vórtice é efetivamente distribuído.
    if (active.length <= 1) {
      // Garante que o único ativo (se houver) já igualou a aposta vigente;
      // caso contrário ainda precisa decidir (pagar/correr).
      const pending = active.find((p) => p.committed < this.state.currentBet);
      if (!pending) {
        this.runToShowdown();
        return;
      }
    }

    // Rodada de apostas termina quando todos os ativos agiram e igualaram.
    const allActed = active.every((p) => p.acted);
    const allMatched = active.every((p) => p.committed === this.state.currentBet);

    if (allActed && allMatched) {
      this.nextPhase();
      return;
    }

    // Passa a vez para o proximo ativo.
    const n = this.state.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (this.state.turnIndex + i) % n;
      const p = this.state.players[idx];
      if (!p.folded && !p.allIn) {
        this.state.turnIndex = idx;
        return;
      }
    }
    // Ninguem mais pode agir (todos all-in) -> corre ate o showdown.
    this.runToShowdown();
  }

  private resetBettingRound(): void {
    this.state.currentBet = 0;
    this.state.lastRaiseAmount = 0;
    for (const p of this.state.players) {
      p.committed = 0;
      p.acted = p.folded || p.allIn; // quem ja esta fora/all-in nao precisa agir
      p.swapsUsed = 0;
    }
    this.state.turnIndex = this.firstActiveFrom(this.state.dealerIndex);
  }

  private nextPhase(): void {
    switch (this.state.phase) {
      case "preflop":
        this.state.community.push(...this.draw(3));
        this.state.phase = "flop";
        this.state.message = "Flop: 3 peças comunitárias na mesa.";
        this.resetBettingRound();
        break;
      case "flop":
        this.state.community.push(...this.draw(2));
        this.state.phase = "turn";
        this.state.message = "Turn: mais 2 peças (5 na mesa).";
        this.resetBettingRound();
        break;
      case "turn":
        this.state.community.push(...this.draw(1));
        this.state.phase = "river";
        this.state.message = "River: a 6ª e última peça. Apostas finais!";
        this.resetBettingRound();
        break;
      case "river":
        this.doShowdown();
        break;
      default:
        break;
    }
  }

  /**
   * Corre todas as peças comunitárias que faltam e vai direto ao showdown.
   * Usado quando não há mais apostas possíveis (todos os contendores restantes
   * estão all-in). A rodada só é resolvida no showdown — nunca antes.
   */
  private runToShowdown(): void {
    const target = 6; // total de comunitárias ao fim da rodada
    const need = target - this.state.community.length;
    if (need > 0) this.state.community.push(...this.draw(need));
    this.state.message = "Todos all-in! Revelando o restante da mesa...";
    this.doShowdown();
  }

  // ---------- trocas ----------
  // preflop: ate 2 trocas | flop: ate 1 troca | turn/river: nenhuma.
  swap(playerId: string, tokenIds: string[]): string | null {
    const p = this.getPlayer(playerId);
    if (!p) return "Jogador inexistente.";
    if (p.folded) return "Você desistiu da mão.";
    const maxSwaps = this.state.phase === "preflop" ? 2 : this.state.phase === "flop" ? 1 : 0;
    if (maxSwaps === 0) return "Trocas encerradas nesta fase.";
    if (p.swapsUsed + tokenIds.length > maxSwaps) {
      return `Você pode trocar no máximo ${maxSwaps - p.swapsUsed} peça(s) agora.`;
    }
    const toSwap: Token[] = [];
    for (const id of tokenIds) {
      const t = p.hand.find((x) => x.id === id);
      if (!t) return "Peça não está na sua mão.";
      toSwap.push(t);
    }
    // Descarta (visivel) e puxa novas.
    for (const t of toSwap) {
      p.hand = p.hand.filter((x) => x.id !== t.id);
      p.discards.push(t);
    }
    p.hand.push(...this.draw(toSwap.length));
    p.swapsUsed += toSwap.length;
    p.stats.swaps += toSwap.length;
    return null;
  }

  // ---------- resolucao ----------

  private finishByFold(winner?: PlayerState): void {
    if (winner) {
      winner.lives += this.state.vortex;
      winner.stats.roundsWon++;
      winner.stats.livesWon += this.state.vortex;
      this.state.message = `${winner.name} levou o Vórtice (todos correram).`;
      this.state.showdown = {
        scores: [],
        winners: [winner.id],
        potWon: this.state.vortex,
      };
    }
    this.state.vortex = 0;
    this.state.phase = "showdown";
  }

  private doShowdown(): void {
    const contenders = this.state.players.filter((p) => !p.folded);
    const scores = contenders.map((p) => ({
      playerId: p.id,
      result: bestScore([...p.hand, ...this.state.community]),
    }));

    // Estatisticas: chegou ao showdown + melhor combo.
    for (const s of scores) {
      const p = this.getPlayer(s.playerId)!;
      p.stats.showdownsReached++;
      if (s.result.score > p.stats.bestCombo) p.stats.bestCombo = s.result.score;
    }

    let maxScore = -1;
    for (const s of scores) maxScore = Math.max(maxScore, s.result.score);
    const winners = scores.filter((s) => s.result.score === maxScore).map((s) => s.playerId);

    const share = Math.floor(this.state.vortex / winners.length);
    let remainder = this.state.vortex - share * winners.length;
    for (const wId of winners) {
      const w = this.getPlayer(wId)!;
      const gained = share + (remainder > 0 ? 1 : 0);
      w.lives += gained;
      w.stats.roundsWon++;
      w.stats.livesWon += gained;
      if (remainder > 0) remainder--;
    }

    this.state.showdown = { scores, winners, potWon: this.state.vortex };
    this.state.vortex = 0;
    this.state.phase = "showdown";

    const winnerNames = winners.map((id) => this.getPlayer(id)!.name).join(", ");
    this.state.message = `Showdown! Vencedor(es): ${winnerNames}.`;
  }

  /** Verifica fim de jogo (apenas 1 com vidas). */
  checkGameOver(): string | null {
    // A partida só pode ser encerrada depois que a rodada foi resolvida — ou
    // seja, no showdown, com o Vórtice já distribuído. Durante as apostas as
    // vidas apostadas estão no Vórtice e ainda podem voltar ao jogador no
    // showdown; não podemos declarar vencedor antes disso.
    if (this.state.phase !== "showdown") return null;

    // Marca jogadores recem-eliminados com a rodada em que cairam.
    for (const p of this.state.players) {
      if (p.lives <= 0 && p.stats.eliminatedRound === null && p.stats.roundsPlayed > 0) {
        p.stats.eliminatedRound = this.state.roundNumber;
      }
    }

    const alive = this.state.players.filter((p) => p.lives > 0);
    if (alive.length <= 1) {
      this.state.phase = "gameover";
      const champ = alive[0] ?? null;
      this.state.message = champ
        ? `${champ.name} é o único sobrevivente e vence a partida! 🏆`
        : "Fim de jogo.";
      this.state.summary = this.buildSummary(champ?.id ?? null);
      return champ?.id ?? null;
    }
    return null;
  }

  /** Monta o resumo final: ranking por colocacao e destaques da partida. */
  private buildSummary(championId: string | null): GameOverSummary {
    const players = this.state.players.filter((p) => p.stats.roundsPlayed > 0 || p.lives > 0);

    // Ordena: campeao primeiro, depois por rodada de eliminacao (mais tarde = melhor),
    // desempate por Vidas e por rodadas vencidas.
    const ranked = players.slice().sort((a, b) => {
      const aAlive = a.lives > 0 ? 1 : 0;
      const bAlive = b.lives > 0 ? 1 : 0;
      if (aAlive !== bAlive) return bAlive - aAlive;
      const aElim = a.stats.eliminatedRound ?? Infinity;
      const bElim = b.stats.eliminatedRound ?? Infinity;
      if (aElim !== bElim) return bElim - aElim; // caiu mais tarde = melhor
      if (b.lives !== a.lives) return b.lives - a.lives;
      return b.stats.roundsWon - a.stats.roundsWon;
    });

    ranked.forEach((p, i) => {
      p.stats.placement = i + 1;
    });

    const ranking = ranked.map((p) => ({
      playerId: p.id,
      name: p.name,
      placement: p.stats.placement ?? ranked.indexOf(p) + 1,
      lives: p.lives,
      survived: p.lives > 0,
      eliminatedRound: p.stats.eliminatedRound,
      stats: p.stats,
    }));

    // Destaques da partida.
    const pick = <T>(getter: (p: PlayerState) => number) => {
      let best: PlayerState | null = null;
      for (const p of players) {
        if (!best || getter(p) > getter(best)) best = p;
      }
      return best && getter(best) > 0 ? best : null;
    };

    const combo = pick((p) => p.stats.bestCombo);
    const aggr = pick((p) => p.stats.raises);
    const wins = pick((p) => p.stats.roundsWon);

    return {
      championId,
      totalRounds: this.state.roundNumber,
      ranking,
      highlights: {
        biggestCombo: combo
          ? { playerId: combo.id, name: combo.name, value: combo.stats.bestCombo }
          : null,
        mostAggressive: aggr
          ? { playerId: aggr.id, name: aggr.name, raises: aggr.stats.raises }
          : null,
        mostRoundsWon: wins
          ? { playerId: wins.id, name: wins.name, rounds: wins.stats.roundsWon }
          : null,
      },
    };
  }

  // ---------- serializacao por jogador ----------
  /**
   * Gera a visao do estado para um jogador especifico: esconde as maos
   * dos adversarios (exceto no showdown) e os discards ficam visiveis.
   */
  viewFor(playerId: string): object {
    const revealed = this.state.phase === "showdown" || this.state.phase === "gameover";
    return {
      roomCode: this.state.roomCode,
      ownerId: this.state.ownerId,
      startingLives: this.state.startingLives,
      phase: this.state.phase,
      vortex: this.state.vortex,
      currentBet: this.state.currentBet,
      lastRaiseAmount: this.state.lastRaiseAmount,
      community: this.state.community,
      turnPlayerId: this.state.players[this.state.turnIndex]?.id ?? null,
      dealerId: this.state.players[this.state.dealerIndex]?.id ?? null,
      message: this.state.message,
      showdown: this.state.showdown,
      roundNumber: this.state.roundNumber,
      summary: this.state.summary,
      you: playerId,
      players: this.state.players.map((p) => ({
        id: p.id,
        name: p.name,
        lives: p.lives,
        committed: p.committed,
        folded: p.folded,
        allIn: p.allIn,
        connected: p.connected,
        swapsUsed: p.swapsUsed,
        discards: p.discards,
        isTurn: this.state.players[this.state.turnIndex]?.id === p.id,
        // mao visivel apenas para o proprio jogador ou no showdown
        hand: p.id === playerId || revealed ? p.hand : null,
        handCount: p.hand.length,
        stats: p.stats,
      })),
    };
  }
}
