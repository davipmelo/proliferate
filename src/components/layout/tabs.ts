import { Layers, Library, Sparkles, Printer } from 'lucide-react';
import type { TabId } from '../../types/models.ts';

export const TABS: { id: TabId; label: string; icon: typeof Layers }[] = [
  { id: 'decks', label: 'Decks', icon: Layers },
  { id: 'collection', label: 'Coleção', icon: Library },
  { id: 'utilities', label: 'Utilitários', icon: Sparkles },
  { id: 'proxies', label: 'Proxies', icon: Printer },
];
