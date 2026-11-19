import { useState } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';
import type { Card } from '../../types/models.ts';
import { getCardByName } from '../../services/scryfall.ts';
import { frontImage } from '../../types/cardRules.ts';
import { toast, previewProps } from '../../state/ui.tsx';
import { CardSearch } from '../common/CardSearch.tsx';
import { Spinner } from '../common/bits.tsx';
import { openArtPicker } from '../launchers.tsx';

/** Busca de comandante/parceiro com autocomplete e escolha de arte. */
export function CommanderPicker({ label, value, onChange }: { label: string; value?: Card; onChange: (c: Card | undefined) => void }) {
  const [loading, setLoading] = useState(false);
  const pick = async (name: string) => {
    setLoading(true);
    try {
      const c = await getCardByName(name);
      if (!c) return toast('Carta não encontrada.', 'error');
      if (!/legendary|lendári/i.test(c.typeLine) && !/can be your commander/i.test(c.oracleText ?? '')) toast('Atenção: essa carta não é lendária.', 'info');
      onChange(c);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="field">
      <label>{label}</label>
      {value ? (
        <div className="row section" style={{ padding: 8 }}>
          <img src={frontImage(value, 'small')} alt="" className="list-thumb" {...previewProps(frontImage(value, 'normal'))} />
          <div className="grow">
            <div style={{ fontWeight: 600 }}>{value.name}</div>
            <div className="small subtle ellipsis">{value.setName} #{value.collectorNumber}</div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openArtPicker({ cards: [value], onSelect: (_i, c) => onChange(c) })}><ImageIcon size={15} /> Arte</button>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onChange(undefined)} aria-label="Remover"><X size={16} /></button>
        </div>
      ) : (
        <div className="row">
          <div className="grow"><CardSearch onSelect={pick} placeholder="Buscar carta lendária…" clearOnSelect /></div>
          {loading && <Spinner />}
        </div>
      )}
    </div>
  );
}
