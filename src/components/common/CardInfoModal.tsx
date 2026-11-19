import { Fragment, useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, Repeat2 } from 'lucide-react';
import type { Card } from '../../types/models.ts';
import { getCardDetails, type CardDetails, type DetailPrint } from '../../services/scryfall.ts';
import { frontImage, isCustomArt } from '../../types/cardRules.ts';
import { previewProps } from '../../state/ui.tsx';
import { Modal } from './Modal.tsx';
import { Loading, ManaCost } from './bits.tsx';

const FORMATS: [string, string][] = [
  ['standard', 'Standard'], ['alchemy', 'Alchemy'], ['pioneer', 'Pioneer'], ['historic', 'Historic'],
  ['modern', 'Modern'], ['brawl', 'Brawl'], ['legacy', 'Legacy'], ['standardbrawl', 'Standard Brawl'],
  ['vintage', 'Vintage'], ['timeless', 'Timeless'], ['commander', 'Commander'], ['pauper', 'Pauper'],
  ['oathbreaker', 'Oathbreaker'], ['penny', 'Penny'],
];
const LEGAL: Record<string, string> = { legal: 'Legal', not_legal: 'Não legal', banned: 'Banida', restricted: 'Restrita' };
const RARITY: Record<string, string> = { common: 'Comum', uncommon: 'Incomum', rare: 'Rara', mythic: 'Mítica', special: 'Especial', bonus: 'Bônus' };
const LANG: Record<string, string> = { en: 'Inglês', pt: 'Português', es: 'Espanhol', ja: 'Japonês', de: 'Alemão', fr: 'Francês', it: 'Italiano', ru: 'Russo', ko: 'Coreano', zhs: 'Chinês', zht: 'Chinês trad.', ph: 'Phyrexiano' };

const money = (v: number | undefined, sym: string) => (v == null ? '' : `${sym}${v.toFixed(2)}`);

/** Texto de regras com símbolos de mana e parágrafos. */
function RulesText({ text, italic }: { text?: string; italic?: boolean }) {
  if (!text) return null;
  return (
    <>
      {text.split('\n').map((line, i) => (
        <p key={i} className={italic ? 'flavor' : undefined}>
          {line.split(/(\{[^}]+\})/g).map((part, j) => (/^\{[^}]+\}$/.test(part) ? <ManaCost key={j} cost={part} /> : <Fragment key={j}>{part}</Fragment>))}
        </p>
      ))}
    </>
  );
}

/** Janela com as informações da carta vindas do Scryfall (textos, legalidade, preços e impressões). */
export default function CardInfoModal({ card, foil, onClose }: { card: Card; foil?: boolean; onClose: () => void }) {
  const [printId, setPrintId] = useState<string | undefined>();
  const [data, setData] = useState<CardDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [face, setFace] = useState(0);
  const [reverse, setReverse] = useState(false);
  const [reload, setReload] = useState(0);
  const custom = isCustomArt(card);

  useEffect(() => {
    let alive = true;
    setError(null);
    getCardDetails(card, printId)
      .then((d) => alive && (setData(d), setFace(0), setReverse(false)))
      .catch((e) => alive && setError(e?.message ?? 'Não foi possível carregar do Scryfall.'));
    return () => {
      alive = false;
    };
  }, [card, printId, reload]);

  // Na impressão própria do usuário, a imagem mostrada é a dele; ao escolher outra impressão, a do Scryfall.
  const ownImage = !printId ? frontImage(card, 'large') || frontImage(card, 'normal') : undefined;
  const faceImg = data?.faces[face]?.image;
  const image = reverse && data?.reverseImage ? data.reverseImage : face === 0 && ownImage ? ownImage : faceImg ?? ownImage;
  const p = data?.print;
  const shownPrints = data?.prints.slice(0, 10) ?? [];
  const isCurrent = (x: DetailPrint) => x.id === p?.id;

  return (
    <Modal title={data?.name ?? card.name} onClose={onClose} size="xl" bodyClassName="info-body">
      {error ? (
        <div className="callout danger"><span>{error}</span><button className="btn btn-ghost btn-sm" onClick={() => setReload((r) => r + 1)}><RefreshCw size={14} /> Tentar de novo</button></div>
      ) : !data ? (
        <Loading text="Carregando do Scryfall…" />
      ) : (
        <div className="info-layout">
          <div className="info-art">
            <div className="info-img">
              {image && <img src={image} alt={data.faces[face]?.name ?? data.name} referrerPolicy="no-referrer" />}
            </div>
            {data.faces.length > 1 && data.faces.some((f) => f.image && f.image !== data.faces[0].image) && (
              <button className="btn btn-secondary btn-sm" onClick={() => setFace((f) => (f + 1) % data.faces.length)}><Repeat2 size={15} /> Virar carta</button>
            )}
            {data.reverseImage && (
              <button className="btn btn-secondary btn-sm" onClick={() => setReverse((r) => !r)}><Repeat2 size={15} /> {reverse ? 'Ver frente' : 'Ver outro lado (outra arte)'}</button>
            )}
            {custom && !printId && <span className="small subtle" style={{ textAlign: 'center' }}>Arte {card.artSource === 'mpcfill' ? 'do MPCFill' : 'própria'} · dados da impressão oficial</span>}
          </div>

          <div className="info-text">
            {data.faces.map((f, i) => (
              <div key={i} className={`info-face ${data.faces.length > 1 && i === face ? 'current' : ''}`}>
                <div className="info-row info-name"><span>{f.name}</span><ManaCost cost={f.manaCost} /></div>
                {f.typeLine && <div className="info-row">{f.typeLine}</div>}
                {(f.oracleText || f.flavorText) && (
                  <div className="info-row info-rules">
                    <RulesText text={f.oracleText} />
                    <RulesText text={f.flavorText} italic />
                  </div>
                )}
                {(f.power != null || f.loyalty || f.defense) && (
                  <div className="info-row info-stats">{f.power != null ? `${f.power}/${f.toughness}` : f.loyalty ? `Lealdade ${f.loyalty}` : `Defesa ${f.defense}`}</div>
                )}
              </div>
            ))}
            {data.artist && <div className="info-row info-artist">Ilustrada por {data.artist}</div>}
            <div className="info-legal">
              {FORMATS.map(([k, label]) => {
                const st = data.legalities[k] ?? 'not_legal';
                return (
                  <div key={k} className="legal-item">
                    <span className={`legal-badge ${st}`}>{LEGAL[st] ?? st}</span>
                    <span>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="info-side">
            {p && (
              <div className="info-set">
                <b>{p.setName} ({p.setCode})</b>
                <span>#{p.collectorNumber} · {RARITY[p.rarity] ?? p.rarity} · {LANG[p.lang] ?? p.lang.toUpperCase()}{foil ? ' · Foil' : ''}</span>
              </div>
            )}
            <div className="info-prices">
              <div><span>USD</span><b>{money(foil ? p?.usdFoil ?? p?.usd : p?.usd ?? p?.usdFoil, '$') || '—'}</b></div>
              <div><span>EUR</span><b>{money(p?.eur, '€') || '—'}</b></div>
              <div><span>TIX</span><b>{p?.tix != null ? p.tix.toFixed(2) : '—'}</b></div>
            </div>
            <table className="info-prints">
              <thead><tr><th>Impressões</th><th>USD</th><th>EUR</th><th>TIX</th></tr></thead>
              <tbody>
                {shownPrints.map((x) => (
                  <tr key={x.id} className={isCurrent(x) ? 'current' : ''} onClick={() => setPrintId(x.id)} {...previewProps(x.image)} title="Ver esta impressão">
                    <td><span className="ellipsis">{x.setName} <small>#{x.collectorNumber}</small></span></td>
                    <td className="usd">{money(x.usd ?? x.usdFoil, '$')}</td>
                    <td className="eur">{money(x.eur, '€')}</td>
                    <td className="tix">{x.tix != null ? x.tix.toFixed(2) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.totalPrints > shownPrints.length && <span className="small subtle">Mostrando {shownPrints.length} de {data.totalPrints} impressões</span>}
            {printId && <button className="btn btn-ghost btn-sm" onClick={() => setPrintId(undefined)}>Voltar para a sua impressão</button>}
            {data.scryfallUri && (
              <a className="btn btn-ghost btn-sm" href={data.prints.find(isCurrent)?.scryfallUri ?? data.scryfallUri} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Abrir no Scryfall</a>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
