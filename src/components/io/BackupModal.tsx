import { useRef, useState } from 'react';
import { Archive, FileUp, Info } from 'lucide-react';
import type { AppData, Preferences } from '../../types/models.ts';
import { useStore } from '../../state/store.tsx';
import { confirmDialog, toast } from '../../state/ui.tsx';
import { backupSummary, createBackup, mergeData, parseBackup } from '../../services/backup.ts';
import { downloadText } from '../../services/image.ts';
import { Modal } from '../common/Modal.tsx';

export default function BackupModal({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [incoming, setIncoming] = useState<{ data: AppData; preferences?: Partial<Preferences>; name: string } | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const fileRef = useRef<HTMLInputElement>(null);

  const download = () => {
    const b = createBackup(store.data, store.prefs);
    downloadText(JSON.stringify(b), `proliferate-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    toast('Backup baixado.');
  };

  const onFile = async (f: File) => {
    try {
      const parsed = parseBackup(await f.text());
      setIncoming({ ...parsed, name: f.name });
    } catch (e: any) {
      toast(e?.message ?? 'Backup inválido.', 'error');
    }
  };

  const restore = async () => {
    if (!incoming) return;
    if (mode === 'replace') {
      const ok = await confirmDialog({ title: 'Substituir tudo?', message: <p>Seus dados atuais ({backupSummary(store.data)}) serão substituídos pelo backup. Esta ação não pode ser desfeita — baixe um backup antes, se quiser.</p>, danger: true, confirmLabel: 'Substituir' });
      if (!ok) return;
      store.replaceAll(incoming.data, { prefs: incoming.preferences });
    } else {
      store.replaceAll(mergeData(store.data, incoming.data));
    }
    toast(mode === 'replace' ? 'Backup restaurado.' : 'Backup mesclado aos seus dados.');
    onClose();
  };

  return (
    <Modal
      title="Backup completo"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
          {incoming && <button className="btn btn-primary" onClick={restore}>{mode === 'replace' ? 'Substituir tudo' : 'Mesclar dados'}</button>}
        </>
      }
    >
      <div className="section">
        <div className="section-title" style={{ fontSize: 'var(--fs-md)' }}><Archive size={18} /> Salvar backup</div>
        <p className="small muted" style={{ marginBottom: 10 }}>Arquivo .json com coleção, decks, fila de proxies, tags e preferências. Atual: {backupSummary(store.data)}.</p>
        <button className={`btn ${incoming ? 'btn-secondary' : 'btn-primary'}`} onClick={download}><Archive size={16} /> Baixar backup (.json)</button>
      </div>
      <div className="section">
        <div className="section-title" style={{ fontSize: 'var(--fs-md)' }}><FileUp size={18} /> Restaurar backup</div>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}><FileUp size={16} /> Escolher arquivo…</button>
        {incoming && (
          <div className="col" style={{ marginTop: 12 }}>
            <div className="callout"><Info size={16} /><span><b>{incoming.name}</b>: {backupSummary(incoming.data)}.</span></div>
            <label className="check"><input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} /> <span><b>Mesclar</b> — soma quantidades de cartas iguais e adiciona decks sem duplicar ids.</span></label>
            <label className="check"><input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /> <span><b>Substituir tudo</b> — apaga os dados atuais e usa só o backup.</span></label>
          </div>
        )}
      </div>
    </Modal>
  );
}
