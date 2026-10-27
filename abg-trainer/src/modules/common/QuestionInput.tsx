import type { Question } from '../trainer/questions';
import { useT } from './useT';

interface Props {
  q: Question;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  name: string;
}

export function QuestionInput({ q, value, onChange, disabled, name }: Props) {
  const { t } = useT();
  const labelId = name + '-label';
  if (q.kind === 'number') {
    return (
      <div className="question">
        <label id={labelId} htmlFor={name}>{t(q.promptKey)}</label>
        <input
          id={name}
          data-testid={'q-' + q.id}
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={name + '-tol'}
        />
        <span id={name + '-tol'} className="muted small">{t('q.tolerance', { tol: q.tolerance ?? 0 })}</span>
      </div>
    );
  }
  return (
    <fieldset className="question" role="radiogroup" aria-labelledby={labelId}>
      <legend id={labelId}>{t(q.promptKey)}</legend>
      <div className="options">
        {q.options!.map((o) => (
          <label key={o.value} className={'option' + (value === o.value ? ' selected' : '')}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              disabled={disabled}
              onChange={() => onChange(o.value)}
              data-testid={`q-${q.id}-${o.value}`}
            />
            {t(o.labelKey)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function answerLabel(q: Question, v: string | number, t: (k: string) => string, n: (v: number, d?: number) => string): string {
  if (q.kind === 'number') {
    const num = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return v === '' || !Number.isFinite(num) ? '—' : n(num, 1);
  }
  const o = q.options!.find((x) => x.value === v);
  return o ? t(o.labelKey) : '—';
}
