// Parser de listas de cartas (MTG Arena, Moxfield, LigaMagic e lista simples) — lógica pura.
import type { DeckCategory } from '../types/models.ts';

export type ParsedSection = DeckCategory | 'token';

export interface ParsedEntry {
  quantity: number;
  name: string;
  set?: string;
  number?: string;
  foil?: boolean;
  section: ParsedSection;
  line: number;
}

export interface ParseResult {
  entries: ParsedEntry[];
  errors: { line: number; text: string }[];
  format: 'arena' | 'moxfield' | 'ligamagic' | 'simple' | 'csv';
}

const SECTION_ALIASES: [RegExp, ParsedSection][] = [
  [/^(commanders?|comandantes?|cmdr)$/i, 'commander'],
  [/^(partners?|parceiros?)$/i, 'partner'],
  [/^(companions?|companheiros?)$/i, 'companion'],
  [/^(deck|main|mainboard|main deck|principal|maindeck|cartas|creatures?|criaturas?|lands?|terrenos?|spells?|mágicas|instants?|sorceries|artifacts?|enchantments?|planeswalkers?|outros?)$/i, 'main'],
  [/^(sideboard|side|reserva)$/i, 'sideboard'],
  [/^(maybeboard|maybe|considering|talvez)$/i, 'maybeboard'],
  [/^(tokens?|fichas?)$/i, 'token'],
];

function detectSection(line: string): ParsedSection | null {
  const clean = line
    .replace(/^\/\/\s*/, '')
    .replace(/^#+\s*/, '')
    .replace(/:$/, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/\s+\d+$/, '')
    .trim();
  for (const [re, sec] of SECTION_ALIASES) if (re.test(clean)) return sec;
  return null;
}

// "4", "4x", "4 x"
const QTY = /^(\d+)\s*x?\s+/i;
// (SET) 123 | [SET] 123 | (SET:123) | [SET-123]
const SET_NUM = /\s+[([]([A-Za-z0-9]{2,6})(?:[\]):\s-]+([A-Za-z0-9★†-]+))?[\])]?(?:\s+([A-Za-z0-9★†-]+))?\s*$/;
const FOIL = /\s*(\*F\*|\*E\*|\(foil\)|\[foil\]|\bfoil\b)\s*/gi;

/** Faz o parse de uma única linha de carta. */
export function parseLine(raw: string): (Omit<ParsedEntry, 'section' | 'line'> & { commander?: boolean }) | null {
  let line = raw.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
  if (!line) return null;
  // Marcas de comandante: *CMDR* (Moxfield/MTGO), [Commander] / [Commander{top}] (Archidekt), (Commander).
  const CMDR = /\s*(\*CMDR\*|\[commanders?(\{[^\]]*\})?\]|\(commanders?\))\s*/i;
  const commander = CMDR.test(line);
  if (commander) line = line.replace(CMDR, ' ').trim();
  // Remove marcações extras do Archidekt/Moxfield: [Categoria], ^Tag^, #tags
  line = line.replace(/\s+\^[^^]*\^/g, '').replace(/\s+#\S+/g, '').replace(/\s*\[[^\]]*\{[^\]]*\]\s*$/, '');
  let foil = false;
  if (FOIL.test(line)) {
    foil = true;
    line = line.replace(FOIL, ' ').trim();
  }
  let quantity = 1;
  const q = line.match(QTY);
  if (q) {
    quantity = parseInt(q[1], 10);
    line = line.slice(q[0].length);
  } else {
    // "Nome x4" ou "Nome 4x"
    const qe = line.match(/\s+x?(\d+)x?$/i);
    if (qe && !/[([]/.test(line)) {
      quantity = parseInt(qe[1], 10);
      line = line.slice(0, -qe[0].length);
    }
  }
  let set: string | undefined;
  let number: string | undefined;
  const sm = line.match(SET_NUM);
  if (sm) {
    set = sm[1].toLowerCase();
    number = sm[2] ?? sm[3];
    line = line.slice(0, sm.index).trim();
  }
  // Remove categoria no final ("[Ramp]") e espaços extras.
  line = line.replace(/\s*\[[^\]]+\]\s*$/, '').trim();
  if (!line || quantity <= 0) return null;
  return { quantity, name: line, set, number, foil: foil || undefined, ...(commander ? { commander: true } : {}) };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if ((ch === ',' || ch === ';') && !inQ) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iq = idx('quantidade', 'quantity', 'qty', 'count', 'qtd');
  const iname = idx('nome', 'name', 'card', 'card name');
  const iset = idx('edição', 'edicao', 'set', 'set code', 'edition');
  const inum = idx('número', 'numero', 'collector number', 'number', 'collector_number');
  const ifoil = idx('foil');
  const icat = idx('categoria', 'category', 'board');
  const entries: ParsedEntry[] = [];
  const errors: ParseResult['errors'] = [];
  lines.slice(1).forEach((l, i) => {
    const c = splitCsvLine(l);
    const name = c[iname];
    if (!name) return errors.push({ line: i + 2, text: l });
    const cat = (c[icat] ?? '').toLowerCase();
    entries.push({
      quantity: parseInt(c[iq] ?? '1', 10) || 1,
      name,
      set: iset >= 0 && c[iset] ? c[iset].toLowerCase() : undefined,
      number: inum >= 0 && c[inum] ? c[inum] : undefined,
      foil: ifoil >= 0 && /^(sim|yes|true|1|foil)$/i.test(c[ifoil] ?? '') ? true : undefined,
      section: (detectSection(cat) ?? (['commander', 'partner', 'companion', 'main', 'sideboard', 'maybeboard'].includes(cat) ? cat : 'main')) as ParsedSection,
      line: i + 2,
    });
  });
  return { entries, errors, format: 'csv' };
}

/** Faz o parse de uma lista completa, reconhecendo seções. */
export function parseDeckList(text: string): ParseResult {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  if (/^"?(quantidade|quantity|qty|count|qtd)"?[,;]/i.test(firstLine) || /^"?(nome|name)"?[,;]/i.test(firstLine)) return parseCsv(text);

  const entries: ParsedEntry[] = [];
  const errors: ParseResult['errors'] = [];
  let section: ParsedSection = 'main';
  let sawBlankAfterMain = false;
  let format: ParseResult['format'] = 'simple';
  const lines = text.split(/\r?\n/);
  let sectionExplicit = false;

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) {
      // Formato Arena/MTGO: linha em branco separa o sideboard (se não há seção explícita).
      if (entries.some((e) => e.section === 'main')) sawBlankAfterMain = true;
      return;
    }
    if (/^(about|name|nome)\s+/i.test(line) && !QTY.test(line)) return; // cabeçalho "About / Name X" do Arena
    const sec = detectSection(line);
    if (sec && !QTY.test(line)) {
      section = sec;
      sectionExplicit = true;
      if (/^(deck|commander|sideboard|companion)$/i.test(line)) format = 'arena';
      if (/:$/.test(line)) format = 'moxfield';
      sawBlankAfterMain = false;
      return;
    }
    if (line.startsWith('//') || line.startsWith('#')) return;
    const parsed = parseLine(line);
    if (!parsed) {
      errors.push({ line: i + 1, text: raw });
      return;
    }
    if (parsed.set && parsed.number) format = format === 'simple' ? 'moxfield' : format;
    let sec2: ParsedSection = section;
    if (!sectionExplicit && sawBlankAfterMain && section === 'main') sec2 = 'sideboard';
    const { commander, ...rest } = parsed;
    entries.push({ ...rest, section: commander ? 'commander' : sec2, line: i + 1 });
  });
  // Lista com acentos/termos em PT → provavelmente LigaMagic.
  if (format === 'simple' && entries.some((e) => /[ãõçáéíóúâêô]/i.test(e.name))) format = 'ligamagic';
  return { entries, errors, format };
}

/** Agrupa entradas idênticas (mesmo nome, edição, número, foil e seção). */
export function mergeEntries(entries: ParsedEntry[]): ParsedEntry[] {
  const map = new Map<string, ParsedEntry>();
  for (const e of entries) {
    const k = `${e.name.toLowerCase()}|${e.set ?? ''}|${e.number ?? ''}|${e.foil ? 1 : 0}|${e.section}`;
    const ex = map.get(k);
    if (ex) ex.quantity += e.quantity;
    else map.set(k, { ...e });
  }
  return [...map.values()];
}
