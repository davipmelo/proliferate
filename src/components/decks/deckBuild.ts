import type { Card, DeckCard, DeckCategory } from '../../types/models.ts';
import { canBeCommander, hasPartner, namesMatch } from '../../types/cardRules.ts';
import { uid } from '../../services/normalize.ts';
import type { ResolvedEntry } from '../../services/importer.ts';

/**
 * Monta as cartas do deck a partir de entradas resolvidas, reaproveitando a arte e o vínculo
 * com a coleção de cartas já existentes (quando a lista não especifica a edição).
 */
export function buildDeckCards(resolved: ResolvedEntry[], existing: DeckCard[] = []): DeckCard[] {
  const out: DeckCard[] = [];
  for (const r of resolved) {
    if (r.entry.section === 'token') continue;
    const category = r.entry.section as DeckCategory;
    const prev = !r.entry.set ? existing.find((e) => namesMatch(e.card.name, r.card.name)) : undefined;
    const card: Card = prev?.card ?? r.card;
    const same = out.find((o) => o.card.id === card.id && o.category === category && !!o.isFoil === !!r.entry.foil);
    if (same) same.quantity += r.entry.quantity;
    else
      out.push({
        instanceId: uid('dc'),
        card,
        quantity: r.entry.quantity,
        category,
        isFoil: r.entry.foil || prev?.isFoil || undefined,
      });
  }
  return out;
}

/**
 * Lista colada sem seção de comandante: se a primeira carta (1 cópia) pode ser comandante, ela é o
 * comandante; se a segunda também puder e ambas tiverem Partner, ela vira o parceiro.
 */
export function detectCommanderFromList(resolved: ResolvedEntry[]): { commander?: Card; partner?: Card; consumed: number } {
  const main = resolved.filter((r) => r.entry.section === 'main');
  if (resolved.some((r) => r.entry.section === 'commander')) return { consumed: 0 };
  const first = main[0];
  if (!first || first.entry.quantity !== 1 || !canBeCommander(first.card)) return { consumed: 0 };
  const second = main[1];
  if (second && second.entry.quantity === 1 && canBeCommander(second.card) && hasPartner(first.card) && hasPartner(second.card)) {
    return { commander: first.card, partner: second.card, consumed: 2 };
  }
  return { commander: first.card, consumed: 1 };
}

const rulesText = (c: Pick<Card, 'oracleText' | 'cardFaces'>) => `${c.oracleText ?? ''}\n${(c.cardFaces ?? []).map((f) => f.oracleText ?? '').join('\n')}`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Pode ocupar a zona de comando ao lado de outro comandante (Background também conta). */
function canBeSecondCommander(card: Card): boolean {
  return canBeCommander(card) || /\bBackground\b/.test(card.typeLine);
}

/**
 * As duas cartas podem ser comandantes juntas? Cobre Partner, "Partner with", "Partner—X",
 * Friends forever, Choose a Background e Doctor's companion.
 */
export function canPair(a: Card, b: Card): boolean {
  const ta = rulesText(a);
  const tb = rulesText(b);
  const with_ = (t: string, other: Card) => new RegExp(`partner with ${escapeRe(other.name.split(' // ')[0])}`, 'i').test(t);
  if (with_(ta, b) || with_(tb, a)) return true;
  const generic = (t: string) => /(^|\n|,)\s*partner\b(?!\s+with)(?!\s*[—-])/im.test(t);
  if (generic(ta) && generic(tb)) return true;
  const group = (t: string) => t.match(/partner\s*[—-]\s*([^\n(]+)/i)?.[1].trim().toLowerCase();
  if (group(ta) && group(ta) === group(tb)) return true;
  if (/friends forever/i.test(ta) && /friends forever/i.test(tb)) return true;
  const bg = (t: string, y: Card) => /choose a background/i.test(t) && /\bBackground\b/.test(y.typeLine);
  if (bg(ta, b) || bg(tb, a)) return true;
  const doc = (t: string, y: Card) => /doctor's companion/i.test(t) && /Time Lord Doctor/i.test(y.typeLine);
  return doc(ta, b) || doc(tb, a);
}

export interface CommanderAssignment {
  commander?: Card;
  partner?: Card;
  /** Entradas que sobram para o deck (seções commander/partner não usadas viram main). */
  rest: ResolvedEntry[];
  /** Comandante/parceiro encontrados por dedução (não por seção explícita nem pelo campo). */
  detected: { commander: boolean; partner: boolean };
}

/**
 * Descobre comandante e parceiro de uma lista, mesmo sem seção "Commander":
 * 1. seções Commander/Partner da lista (e marcas *CMDR*);
 * 2. cartas escolhidas nos campos (removidas da lista para não duplicar);
 * 3. dedução: 1ª carta, sideboard de 1–2 cartas (MTGO) ou última carta, se puder ser comandante;
 * 4. parceiro: carta compatível vizinha ao comandante, no sideboard ou nomeada em "Partner with".
 */
export function assignCommanders(resolved: ResolvedEntry[], opts: { commander?: Card; partner?: Card; hasCommander: boolean }): CommanderAssignment {
  let cmd = opts.commander;
  let ptn = opts.partner;
  const used = new Set<ResolvedEntry>();
  const detected = { commander: false, partner: false };
  const single = (r: ResolvedEntry) => r.entry.quantity === 1 && r.entry.section !== 'maybeboard' && r.entry.section !== 'token';

  for (const r of resolved.filter((x) => x.entry.section === 'commander' || x.entry.section === 'partner')) {
    if (cmd && namesMatch(r.card.name, cmd.name)) used.add(r);
    else if (ptn && namesMatch(r.card.name, ptn.name)) used.add(r);
    else if (!cmd) (cmd = r.card), used.add(r);
    else if (!ptn) (ptn = r.card), used.add(r);
  }
  // Cartas escolhidas nos campos saem da lista (uma cópia).
  for (const c of [opts.commander, opts.partner]) {
    if (!c) continue;
    const r = resolved.find((x) => !used.has(x) && single(x) && namesMatch(x.card.name, c.name));
    if (r) used.add(r);
  }

  const free = () => resolved.filter((x) => !used.has(x));
  if (!cmd && opts.hasCommander) {
    const main = free().filter((x) => x.entry.section === 'main');
    const side = free().filter((x) => x.entry.section === 'sideboard');
    const sideQty = side.reduce((s, x) => s + x.entry.quantity, 0);
    const candidates = [main[0], ...(sideQty <= 2 ? side : []), main[main.length - 1]].filter(Boolean) as ResolvedEntry[];
    const hit = candidates.find((x) => single(x) && canBeCommander(x.card));
    if (hit) {
      cmd = hit.card;
      used.add(hit);
      detected.commander = true;
    }
  }

  if (cmd && !ptn && (opts.hasCommander || resolved.some((x) => x.entry.section === 'commander'))) {
    const c = cmd;
    const idx = resolved.findIndex((x) => x.card === c);
    const ok = (x?: ResolvedEntry) => !!x && !used.has(x) && single(x) && canBeSecondCommander(x.card) && canPair(c, x.card);
    const neighbors = idx >= 0 ? [resolved[idx + 1], resolved[idx - 1]] : [];
    const main = free().filter((x) => x.entry.section === 'main');
    const side = free().filter((x) => x.entry.section === 'sideboard');
    const named = free().filter((x) => new RegExp(`partner with ${escapeRe(x.card.name.split(' // ')[0])}`, 'i').test(rulesText(c)));
    const hit = [...neighbors, ...(side.length <= 2 ? side : []), main[0], main[main.length - 1], ...named].find(ok);
    if (hit) {
      ptn = hit.card;
      used.add(hit);
      detected.partner = true;
    }
  }

  const rest = free().map((x) =>
    x.entry.section === 'commander' || x.entry.section === 'partner' ? { ...x, entry: { ...x.entry, section: 'main' as const } } : x,
  );
  return { commander: cmd, partner: ptn, rest, detected };
}
