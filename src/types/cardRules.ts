import type { Card, CardImages } from './models.ts';

/**
 * Layouts com duas faces físicas DIFERENTES (frente e verso impressos).
 * "reversible_card" fica de fora: os dois lados são a mesma carta, só com outra arte.
 */
export const DOUBLE_FACED_LAYOUTS = new Set([
  'transform',
  'modal_dfc',
  'meld',
  'battle',
  'double_faced_token',
]);

/** Layouts com várias "partes" impressas na mesma face. */
export const SINGLE_FACE_MULTI_LAYOUTS = new Set([
  'split', 'adventure', 'flip', 'aftermath', 'saga', 'class', 'case', 'prototype',
]);

/**
 * A carta pode ter verso próprio? Só layouts de dupla face real — ou cartas sem layout conhecido
 * (artes próprias/MPCFill sem dados do Scryfall). Aventuras, omens, split etc. têm uma face só,
 * mesmo que algum dado antigo tenha guardado um "verso".
 */
export function canHaveBack(card: Pick<Card, 'layout'>): boolean {
  return !card.layout || DOUBLE_FACED_LAYOUTS.has(card.layout);
}

/** A carta tem verso físico distinto? */
export function isDoubleFaced(card: Pick<Card, 'layout' | 'cardFaces' | 'backImage'>): boolean {
  if (!canHaveBack(card)) return false;
  if (card.backImage) return true;
  if (!card.layout) return false;
  // meld: a parte tem verso (metade do resultado); battle pode ser só frente em alguns casos
  if (card.layout === 'meld') return true;
  return (card.cardFaces?.length ?? 0) >= 2 && !!card.cardFaces?.[1]?.images?.normal;
}

export function frontImage(card: Card, size: keyof CardImages = 'normal'): string {
  const i = card.images;
  return i[size] || i.normal || i.large || i.small || i.art_crop || card.cardFaces?.[0]?.images?.[size] || '';
}

export function backImage(card: Card, size: keyof CardImages = 'normal'): string | undefined {
  if (!isDoubleFaced(card)) return undefined;
  if (card.backImage) return card.backImage;
  if (card.layout === 'meld' && card.meld?.role === 'meld_part') {
    return card.meld.resultImages?.[size] || card.meld.resultImages?.normal;
  }
  const f = card.cardFaces?.[1]?.images;
  return f?.[size] || f?.normal;
}

/** Normaliza um nome para comparação: minúsculas, sem acentos e pontuação irrelevante. */
export function normalizeName(name: string): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Primeira face do nome ("Frente // Verso", "Frente / Verso" → "frente"). */
export function frontName(name: string): string {
  return normalizeName(name.split(/\s*\/\/?\s*/)[0] ?? name);
}

/**
 * Comparação tolerante de nomes de cartas:
 * "Frente // Verso", "Frente / Verso" e só "Frente" são a mesma carta.
 */
export function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = normalizeName(a).replace(/\s*\/\/?\s*/g, ' // ');
  const nb = normalizeName(b).replace(/\s*\/\/?\s*/g, ' // ');
  if (na === nb) return true;
  return frontName(a) === frontName(b);
}

export function isCustomArt(card: Pick<Card, 'artSource' | 'id'>): boolean {
  return card.artSource === 'mpcfill' || card.artSource === 'custom' || /^(mpc|custom)-/.test(card.id);
}

/**
 * Mesma arte/impressão? Cartas oficiais comparam o id do Scryfall;
 * cartas customizadas (MPCFill / arte própria) comparam a URL da imagem.
 */
export function sameArt(a: Card, b: Card): boolean {
  const ca = isCustomArt(a);
  const cb = isCustomArt(b);
  if (ca || cb) {
    if (!(ca && cb)) return false;
    return stripImageSize(frontImage(a)) === stripImageSize(frontImage(b));
  }
  return a.id === b.id;
}

/** Remove sufixos de tamanho do Google Drive (=w400) e query strings para comparar URLs. */
export function stripImageSize(url: string): string {
  return (url || '').replace(/=w\d+(-h\d+)?$/, '').replace(/[?#].*$/, '');
}

/** Mesma carta (oracle), independentemente da arte. */
export function sameCard(a: Card, b: Card): boolean {
  if (a.oracleId && b.oracleId) return a.oracleId === b.oracleId;
  return namesMatch(a.name, b.name);
}

export function isLand(card: Pick<Card, 'typeLine'>): boolean {
  return /\b(land|terreno)\b/i.test(frontType(card.typeLine));
}

export function isBasicLand(card: Pick<Card, 'typeLine' | 'name'>): boolean {
  return /\bBasic\b/i.test(card.typeLine || '') && isLand(card);
}

export function frontType(typeLine: string): string {
  return (typeLine || '').split('//')[0].trim();
}

export const TYPE_ORDER = [
  'Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land', 'Other',
] as const;
export type MainType = (typeof TYPE_ORDER)[number];
export const TYPE_LABELS: Record<MainType, string> = {
  Creature: 'Criaturas', Planeswalker: 'Planeswalkers', Battle: 'Batalhas', Instant: 'Mágicas Instantâneas',
  Sorcery: 'Feitiços', Artifact: 'Artefatos', Enchantment: 'Encantamentos', Land: 'Terrenos', Other: 'Outros',
};

/** Palavras de tipo em inglês e português (linhas de tipo impressas em PT). */
const TYPE_WORDS: [MainType, RegExp][] = [
  ['Creature', /\b(creature|criatura)\b/i],
  ['Land', /\b(land|terreno)\b/i],
  ['Planeswalker', /\bplaneswalker\b/i],
  ['Battle', /\b(battle|batalha)\b/i],
  ['Instant', /\b(instant|instant[aâ]nea)\b/i],
  ['Sorcery', /\b(sorcery|feiti[cç]o)\b/i],
  ['Artifact', /\b(artifact|artefato)\b/i],
  ['Enchantment', /\b(enchantment|encantamento)\b/i],
];

/** Tipo principal para agrupamento (criatura tem prioridade, depois terreno etc.). */
export function mainType(typeLine: string): MainType {
  const t = frontType(typeLine);
  for (const [k, re] of TYPE_WORDS) if (re.test(t)) return k;
  // Tipo da face de trás como último recurso (ex.: frente "Card" sem tipo).
  const back = (typeLine || '').split('//')[1];
  if (back) for (const [k, re] of TYPE_WORDS) if (re.test(back)) return k;
  return 'Other';
}

export const COLOR_CODES = ['W', 'U', 'B', 'R', 'G'] as const;
export type ColorFilterValue = 'W' | 'U' | 'B' | 'R' | 'G' | 'M' | 'C';
export const COLOR_NAMES: Record<ColorFilterValue, string> = {
  W: 'Branco', U: 'Azul', B: 'Preto', R: 'Vermelho', G: 'Verde', M: 'Multicolor', C: 'Incolor',
};

/**
 * Filtro de cores.
 * - exact: a carta tem exatamente as cores selecionadas (M = 2+ cores, C = incolor).
 * - identity: identidade de cor da carta ⊆ cores selecionadas.
 */
export function matchesColorFilter(
  card: Pick<Card, 'colors' | 'colorIdentity'>,
  selected: ColorFilterValue[],
  mode: 'exact' | 'identity',
): boolean {
  if (!selected.length) return true;
  const wantMulti = selected.includes('M');
  const wantColorless = selected.includes('C');
  const sel = selected.filter((c) => 'WUBRG'.includes(c)) as string[];
  if (mode === 'identity') {
    // Identidade (≤): a identidade da carta cabe nas cores escolhidas.
    const id = card.colorIdentity ?? [];
    if (wantColorless && id.length === 0) return true;
    if (sel.length) return id.every((c) => sel.includes(c)) && (!wantMulti || id.length > 1);
    return wantMulti && id.length > 1;
  }
  // Exato (=): as cores da carta são exatamente as escolhidas.
  const cols = card.colors ?? [];
  if (wantColorless && cols.length === 0) return true;
  if (wantMulti) return cols.length > 1 && sel.every((c) => cols.includes(c));
  return sel.length > 0 && cols.length === sel.length && cols.every((c) => sel.includes(c));
}

/** Converte um custo de mana em símbolos: "{2}{W}{U}" → ["2","W","U"]. */
export function parseManaCost(cost?: string): string[] {
  if (!cost) return [];
  return Array.from(cost.matchAll(/\{([^}]+)\}/g), (m) => m[1]);
}

export function displayName(card: Pick<Card, 'name' | 'namePt'>): string {
  return card.namePt && card.namePt !== card.name ? `${card.namePt}` : card.name;
}

/** A carta pode ser comandante? (criatura lendária ou texto "can be your commander") */
export function canBeCommander(card: Pick<Card, 'typeLine' | 'oracleText' | 'cardFaces'>): boolean {
  const front = frontType(card.typeLine);
  const text = `${card.oracleText ?? ''} ${(card.cardFaces ?? []).map((f) => f.oracleText ?? '').join(' ')}`;
  if (/can be your commander/i.test(text)) return true;
  return /\b(legendary|lend[aá]ri[ao])\b/i.test(front) && /\b(creature|criatura)\b/i.test(front);
}

/** Tem a habilidade Partner / Parceiro (inclui "Partner with", "Friends forever", "Choose a Background"). */
export function hasPartner(card: Pick<Card, 'oracleText' | 'cardFaces'>): boolean {
  const text = `${card.oracleText ?? ''} ${(card.cardFaces ?? []).map((f) => f.oracleText ?? '').join(' ')}`;
  return /\b(partner|friends forever|doctor's companion)\b/i.test(text);
}
