import type { Deck } from '../../types/models.ts';
import { Modal } from '../common/Modal.tsx';
export default function PosterModal({ onClose }: { deck: Deck; onClose: () => void }) {
  return <Modal title="Pôster" onClose={onClose}><p>Em breve.</p></Modal>;
}
