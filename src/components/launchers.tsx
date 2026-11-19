// Atalhos para abrir modais globais com carregamento sob demanda.
import { lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import type { Card, Deck } from '../types/models.ts';
import { openModal } from '../state/ui.tsx';
import { Spinner } from './common/bits.tsx';

const ArtPicker = lazy(() => import('./art/ArtPicker.tsx'));
const AddCardModal = lazy(() => import('./collection/AddCardModal.tsx'));
const ImportModal = lazy(() => import('./io/ImportModal.tsx'));
const ExportModal = lazy(() => import('./io/ExportModal.tsx'));
const BackupModal = lazy(() => import('./io/BackupModal.tsx'));
const AuthModal = lazy(() => import('./auth/AuthModal.tsx'));

function ModalFallback() {
  return createPortal(
    <div className="modal-backdrop">
      <Spinner large />
    </div>,
    document.body,
  );
}

export interface ArtPickerOptions {
  /** Cartas navegáveis com ← → (a primeira é a atual se `start` não for informado). */
  cards: Card[];
  start?: number;
  title?: string;
  /** Chamado a cada troca de arte (index da carta na lista e nova carta). */
  onSelect: (index: number, card: Card) => void;
  /** Tipo de busca no MPCFill. */
  tokens?: boolean;
}

export function openArtPicker(opts: ArtPickerOptions): void {
  openModal((close) => (
    <Suspense fallback={<ModalFallback />}>
      <ArtPicker {...opts} onClose={close} />
    </Suspense>
  ));
}

export function openAddCard(opts: { deckId?: string; initialName?: string } = {}): void {
  openModal((close) => (
    <Suspense fallback={<ModalFallback />}>
      <AddCardModal {...opts} onClose={close} />
    </Suspense>
  ));
}

export function openImport(opts: { deckId?: string; target?: 'collection' | 'new-deck' | 'existing-deck' } = {}): void {
  openModal((close) => (
    <Suspense fallback={<ModalFallback />}>
      <ImportModal {...opts} onClose={close} />
    </Suspense>
  ));
}

export function openExport(opts: { deck?: Deck } = {}): void {
  openModal((close) => (
    <Suspense fallback={<ModalFallback />}>
      <ExportModal {...opts} onClose={close} />
    </Suspense>
  ));
}

export function openBackup(): void {
  openModal((close) => (
    <Suspense fallback={<ModalFallback />}>
      <BackupModal onClose={close} />
    </Suspense>
  ));
}

export function openAuth(mode: 'login' | 'register' | 'config' = 'login'): void {
  openModal((close) => (
    <Suspense fallback={<ModalFallback />}>
      <AuthModal mode={mode} onClose={close} />
    </Suspense>
  ));
}
