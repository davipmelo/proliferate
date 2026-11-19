import { Modal } from '../common/Modal.tsx';
export default function Placeholder({ onClose }: { onClose: () => void; [k: string]: unknown }) {
  return <Modal title="Em construção" onClose={onClose}><p>Em breve.</p></Modal>;
}
