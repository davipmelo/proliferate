import type { DeckFormat } from './models.ts';

export interface FormatInfo {
  id: DeckFormat;
  label: string;
  target: number;
  singleton: boolean;
  hasCommander: boolean;
  sideboard: number;
  rule: string;
}

export const FORMATS: Record<DeckFormat, FormatInfo> = {
  commander: {
    id: 'commander', label: 'Commander', target: 100, singleton: true, hasCommander: true, sideboard: 0,
    rule: '100 cartas incluindo o comandante, uma cópia de cada (exceto terrenos básicos). Cores limitadas à identidade do comandante.',
  },
  brawl: {
    id: 'brawl', label: 'Brawl', target: 100, singleton: true, hasCommander: true, sideboard: 0,
    rule: '100 cartas singleton com comandante, usando apenas cartas legais no Standard (Historic Brawl no Arena).',
  },
  standard: {
    id: 'standard', label: 'Standard', target: 60, singleton: false, hasCommander: false, sideboard: 15,
    rule: 'Mínimo de 60 cartas, até 4 cópias de cada, apenas coleções recentes. Sideboard de até 15.',
  },
  modern: {
    id: 'modern', label: 'Modern', target: 60, singleton: false, hasCommander: false, sideboard: 15,
    rule: 'Mínimo de 60 cartas, até 4 cópias, coleções a partir de Oitava Edição. Sideboard de até 15.',
  },
  pioneer: {
    id: 'pioneer', label: 'Pioneer', target: 60, singleton: false, hasCommander: false, sideboard: 15,
    rule: 'Mínimo de 60 cartas, até 4 cópias, coleções a partir de Return to Ravnica. Sideboard de até 15.',
  },
  pauper: {
    id: 'pauper', label: 'Pauper', target: 60, singleton: false, hasCommander: false, sideboard: 15,
    rule: 'Mínimo de 60 cartas, até 4 cópias, somente cartas já impressas como comuns.',
  },
  legacy: {
    id: 'legacy', label: 'Legacy', target: 60, singleton: false, hasCommander: false, sideboard: 15,
    rule: 'Mínimo de 60 cartas, até 4 cópias, todas as coleções com lista de banidas própria.',
  },
  vintage: {
    id: 'vintage', label: 'Vintage', target: 60, singleton: false, hasCommander: false, sideboard: 15,
    rule: 'Mínimo de 60 cartas, todas as coleções; cartas poderosas são restritas a 1 cópia.',
  },
  casual: {
    id: 'casual', label: 'Casual', target: 60, singleton: false, hasCommander: false, sideboard: 15,
    rule: 'Sem regras rígidas — meta de 60 cartas para mesas casuais e kitchen table.',
  },
};

export const FORMAT_LIST = Object.values(FORMATS);

export function formatInfo(f: string | undefined): FormatInfo {
  return FORMATS[(f as DeckFormat)] ?? FORMATS.casual;
}
