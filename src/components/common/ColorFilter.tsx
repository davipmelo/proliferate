import type { ColorMatchMode } from '../../types/models.ts';
import { COLOR_NAMES, type ColorFilterValue } from '../../types/cardRules.ts';

const ORDER: ColorFilterValue[] = ['W', 'U', 'B', 'R', 'G', 'M', 'C'];

interface Props {
  value: ColorFilterValue[];
  onChange: (v: ColorFilterValue[]) => void;
  mode?: ColorMatchMode;
  onModeChange?: (m: ColorMatchMode) => void;
}

export function ColorFilter({ value, onChange, mode, onModeChange }: Props) {
  const toggle = (c: ColorFilterValue) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  return (
    <div className="color-filter">
      {ORDER.map((c) => (
        <button
          key={c}
          className={`color-btn ${c} ${value.includes(c) ? 'active' : ''}`}
          title={COLOR_NAMES[c]}
          aria-label={COLOR_NAMES[c]}
          aria-pressed={value.includes(c)}
          onClick={() => toggle(c)}
        >
          {c === 'M' ? '' : c === 'C' ? '◇' : ''}
        </button>
      ))}
      {mode && onModeChange && (
        <div className="btn-group" style={{ marginLeft: 4 }}>
          <button className={`btn btn-ghost btn-xs ${mode === 'exact' ? 'active' : ''}`} onClick={() => onModeChange('exact')} title="Cores exatamente iguais às selecionadas">
            Exato (=)
          </button>
          <button className={`btn btn-ghost btn-xs ${mode === 'identity' ? 'active' : ''}`} onClick={() => onModeChange('identity')} title="Identidade de cor contida nas selecionadas">
            Identidade (≤)
          </button>
        </div>
      )}
      {value.length > 0 && (
        <button className="btn btn-ghost btn-xs" onClick={() => onChange([])}>
          Limpar
        </button>
      )}
    </div>
  );
}
