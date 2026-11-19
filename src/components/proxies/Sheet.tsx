import type { ProxySettings } from '../../types/models.ts';
import { COLS, footerText, lineStyle, PAGE_H, PAGE_W, ROWS, sheetLines, slotPosition, type Slot } from '../../services/proxyLayout.ts';

/** Uma folha A4 em milímetros reais (usada no preview e na impressão do navegador). */
export function Sheet({ slots, settings, page, total, scale, eager }: { slots: Slot[]; settings: ProxySettings; page: number; total: number; scale?: number; eager?: boolean }) {
  const rowsUsed = Math.min(ROWS, Math.ceil(slots.length / COLS));
  const lines = sheetLines(settings, rowsUsed);
  const rounded = settings.cornerFill !== 'none';
  return (
    <div className="a4" style={scale ? { transform: `scale(${scale})` } : undefined}>
      {slots.map((s, i) => {
        const { x, y } = slotPosition(i);
        const trim = s.trimBleed && settings.trimBleed;
        return (
          <div key={s.key} className={`slot ${rounded ? 'rounded' : ''}`} style={{ left: `${x}mm`, top: `${y}mm` }}>
            {rounded && <div className={`bg ${settings.cornerFill}`} />}
            {trim ? (
              <div className="trim" style={rounded ? { borderRadius: '3mm' } : undefined}>
                <img src={s.image} alt={s.name} loading={eager ? 'eager' : 'lazy'} decoding="async" />
              </div>
            ) : (
              <img src={s.image} alt={s.name} loading={eager ? 'eager' : 'lazy'} decoding="async" />
            )}
          </div>
        );
      })}
      <svg className="overlay" viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} xmlns="http://www.w3.org/2000/svg">
        {lines.map((l, i) => {
          const st = lineStyle(settings, l.kind);
          return <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={st.color} strokeWidth={st.width} strokeDasharray={st.dash?.join(' ')} strokeLinecap={st.round ? 'round' : 'butt'} />;
        })}
      </svg>
      {settings.footer && <div className="footer">{footerText(page, total, slots.length)}</div>}
    </div>
  );
}
