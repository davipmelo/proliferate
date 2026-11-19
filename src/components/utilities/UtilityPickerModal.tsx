import type { TokenCard } from '../../types/models.ts';
import { Modal } from '../common/Modal.tsx';
import { UtilityBrowser } from './UtilityBrowser.tsx';

/** Seletor de fichas/utilitários (mesma tela da aba Utilitários) para usar dentro de um deck. */
export default function UtilityPickerModal({ title = 'Adicionar fichas e utilitários', onPick, onClose }: { title?: string; onPick: (cards: TokenCard[]) => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose} size="xl" bodyClassName="util-modal-body">
      <UtilityBrowser
        mode="pick"
        onPick={(cards) => {
          onPick(cards);
          onClose();
        }}
      />
    </Modal>
  );
}
