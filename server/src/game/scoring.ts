/**
 * Calculo de pontuacao (combos) do Erosion.
 *
 * Regra: escolha ate 3 tokens do MESMO elemento (combinando mao + mesa),
 * some os valores e multiplique pelo tier do elemento. O melhor combo
 * possivel entre todos os elementos disponiveis e a pontuacao do jogador.
 */
import type { ElementName, Token } from "./tokens.js";

export interface ScoreResult {
  score: number;
  element: ElementName | null;
  tier: number;
  tokens: Token[]; // tokens usados no melhor combo
}

/**
 * Dado o conjunto de tokens disponiveis (mao + comunitarios), encontra
 * o melhor combo: para cada elemento, pega ate 3 maiores valores,
 * soma e multiplica pelo tier. Retorna o maior resultado.
 */
export function bestScore(available: Token[]): ScoreResult {
  const byElement = new Map<ElementName, Token[]>();
  for (const t of available) {
    const list = byElement.get(t.element) ?? [];
    list.push(t);
    byElement.set(t.element, list);
  }

  let best: ScoreResult = { score: 0, element: null, tier: 0, tokens: [] };

  for (const [element, tokens] of byElement) {
    const sorted = tokens.slice().sort((a, b) => b.value - a.value);
    const chosen = sorted.slice(0, 3); // ate 3 tokens
    const tier = chosen[0].tier;
    const sum = chosen.reduce((acc, t) => acc + t.value, 0);
    const score = sum * tier;
    if (score > best.score) {
      best = { score, element, tier, tokens: chosen };
    }
  }

  return best;
}
