// Modelos de dados do Proliferate V2.

export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic' | 'special' | 'bonus' | string;
export type Condition = 'NM' | 'SP' | 'MP' | 'HP' | 'DMG';
export const CONDITIONS: Condition[] = ['NM', 'SP', 'MP', 'HP', 'DMG'];

export interface CardImages {
  normal?: string;
  large?: string;
  small?: string;
  art_crop?: string;
}

export interface CardFace {
  name: string;
  manaCost?: string;
  typeLine?: string;
  oracleText?: string;
  power?: string;
  toughness?: string;
  colors?: string[];
  images?: CardImages;
}

/** Dados de "meld": partes que se combinam e o resultado. */
export interface MeldInfo {
  role: 'meld_part' | 'meld_result';
  partnerName?: string;
  resultName?: string;
  resultId?: string;
  resultImages?: CardImages;
}

/** Origem da arte: impressão oficial do Scryfall, MPCFill ou arte enviada pelo usuário. */
export type ArtSource = 'scryfall' | 'mpcfill' | 'custom';

export interface Card {
  id: string; // id da impressão no Scryfall (ou "custom-…"/"mpc-…")
  oracleId?: string;
  name: string;
  namePt?: string;
  manaCost?: string; // "{2}{W}{U}"
  cmc: number;
  typeLine: string;
  oracleText?: string;
  colors: string[];
  colorIdentity: string[];
  power?: string;
  toughness?: string;
  rarity?: Rarity;
  setCode?: string;
  setName?: string;
  collectorNumber?: string;
  images: CardImages;
  priceUsd?: number;
  isFoil?: boolean;
  layout?: string;
  cardFaces?: CardFace[];
  artist?: string;
  frame?: string;
  releasedAt?: string;
  meld?: MeldInfo;
  /** Arte customizada: para MPCFill/arte própria a carta é identificada pela URL. */
  artSource?: ArtSource;
  /** Verso customizado (arte própria/MPCFill de dupla face). */
  backImage?: string;
  /** MPCFill: imagem possui sangria (1/8"). */
  hasBleed?: boolean;
}

/** Ficha/utilitário (token, emblema, plano, masmorra, …). */
export interface TokenCard extends Card {
  utilityType: UtilityCategory;
}

export type UtilityCategory =
  | 'token'
  | 'plane'
  | 'emblem'
  | 'counter'
  | 'dungeon'
  | 'scheme'
  | 'conspiracy'
  | 'attraction';

/** Uma impressão/arte específica de uma carta (usada no seletor de artes). */
export interface CardPrint {
  id: string;
  source: ArtSource;
  name: string;
  setCode?: string;
  setName?: string;
  collectorNumber?: string;
  artist?: string;
  releasedAt?: string;
  frame?: string;
  priceUsd?: number;
  images: CardImages;
  backImages?: CardImages;
  isPromo?: boolean;
  setType?: string;
  borderColor?: string;
  // MPCFill
  dpi?: number;
  sourceName?: string;
  tags?: string[];
  mpcType?: 'CARD' | 'TOKEN' | 'CARDBACK';
  /** Carta completa (para impressões do Scryfall), permite trocar a arte mantendo dados. */
  card?: Card;
}

export interface CollectionItem {
  id: string;
  card: Card;
  quantity: number;
  isFoil: boolean;
  condition: Condition;
  language: string;
  notes?: string;
  tags: string[];
  dateAdded: string;
}

export type DeckCategory = 'commander' | 'partner' | 'companion' | 'main' | 'sideboard' | 'maybeboard';
export const DECK_CATEGORIES: DeckCategory[] = ['commander', 'partner', 'companion', 'main', 'sideboard', 'maybeboard'];
export const CATEGORY_LABELS: Record<DeckCategory, string> = {
  commander: 'Comandante',
  partner: 'Parceiro',
  companion: 'Companheiro',
  main: 'Principal',
  sideboard: 'Sideboard',
  maybeboard: 'Talvez',
};

export interface DeckCard {
  instanceId: string;
  card: Card;
  quantity: number;
  category: DeckCategory;
  isFoil?: boolean;
}

export interface DeckToken {
  instanceId: string;
  card: TokenCard;
  quantity: number;
}

export interface DeckCover {
  image?: string;
  zoom: number; // 1–3
  positionY: number; // 0–100 %
}

export type DeckFormat =
  | 'commander'
  | 'brawl'
  | 'standard'
  | 'modern'
  | 'pioneer'
  | 'pauper'
  | 'legacy'
  | 'vintage'
  | 'casual';

export interface Deck {
  id: string;
  name: string;
  format: DeckFormat;
  description: string;
  commander?: Card;
  partner?: Card;
  cards: DeckCard[];
  tokens: DeckToken[];
  cover: DeckCover;
  tags: string[]; // ids de DeckTag
  createdAt: string;
  updatedAt: string;
}

export interface DeckTag {
  id: string;
  name: string;
  color: string;
}

export interface ProxyItem {
  id: string;
  card: Card | TokenCard;
  quantity: number;
}

export interface AppData {
  collection: CollectionItem[];
  decks: Deck[];
  proxies: ProxyItem[];
  tags: DeckTag[];
}

export const SCHEMA_VERSION = 2;

export interface Backup extends AppData {
  app: 'proliferate';
  schemaVersion: number;
  exportedAt: string;
  preferences?: Partial<Preferences>;
}

export type ViewMode = 'list' | 'grid';
export type ColorMatchMode = 'exact' | 'identity';

export interface ProxySettings {
  cutLines: boolean;
  cutLineColor: string;
  cutLineWidth: number; // 0.15–0.6 mm
  cutLineStyle: 'solid' | 'dashed' | 'dotted';
  cropMarks: boolean;
  cropMarkColor: string;
  cropMarkWidth: number;
  cropMarkLength: number; // 5–16 mm
  rulers: boolean;
  cornerCrosses: boolean;
  cornerFill: 'black' | 'white' | 'none';
  footer: boolean;
  trimBleed: boolean;
}

export interface Preferences {
  decksView: ViewMode;
  collectionView: ViewMode;
  utilitiesView: ViewMode;
  deckEditorView: ViewMode;
  gridSize: number; // largura da carta em px (grade)
  showDetails: boolean;
  deckGroupMode: DeckGroupMode;
  /** Efeito visual de foil nas grades. */
  showFoil: boolean;
  proxySettings: ProxySettings;
  lastTab: TabId;
}

export type DeckGroupMode = 'none' | 'type' | 'cmc';

export type TabId = 'decks' | 'collection' | 'utilities' | 'proxies';
