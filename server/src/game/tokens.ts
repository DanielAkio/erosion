/**
 * Tipos e definicoes de dominio do jogo Erosion.
 */

export type Tier = 1 | 2 | 3;

/** Elementos agrupados por tier (multiplicador). */
export const ELEMENTS: Record<string, { tier: Tier; copies: number }> = {
  // Tier 1 (x1) - 3 copias de cada numero (1..10)
  fogo: { tier: 1, copies: 3 },
  agua: { tier: 1, copies: 3 },
  planta: { tier: 1, copies: 3 },
  vento: { tier: 1, copies: 3 },
  gelo: { tier: 1, copies: 3 },
  // Tier 2 (x2) - 2 copias de cada numero
  raio: { tier: 2, copies: 2 },
  lava: { tier: 2, copies: 2 },
  // Tier 3 (x3) - 1 copia unica de cada numero
  luz: { tier: 3, copies: 1 },
  trevas: { tier: 3, copies: 1 },
};

export type ElementName = keyof typeof ELEMENTS;

/** Metadados para exibicao no client (emoji e cor). */
export const ELEMENT_META: Record<string, { label: string; icon: string; color: string }> = {
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

/** Um token: um numero de 1..10 com um elemento. */
export interface Token {
  id: string;
  element: ElementName;
  value: number; // 1..10
  tier: Tier;
}

/**
 * Constroi o "saco" completo de tokens conforme as regras:
 * para cada elemento, para cada numero 1..10, cria `copies` tokens.
 */
export function buildBag(): Token[] {
  const bag: Token[] = [];
  let counter = 0;
  for (const element of Object.keys(ELEMENTS) as ElementName[]) {
    const { tier, copies } = ELEMENTS[element];
    for (let value = 1; value <= 10; value++) {
      for (let c = 0; c < copies; c++) {
        bag.push({
          id: `t${counter++}`,
          element,
          value,
          tier,
        });
      }
    }
  }
  return bag;
}

/** Fisher-Yates com RNG injetavel (para testes determinísticos). */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
