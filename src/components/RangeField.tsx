import { RotateCcw } from 'lucide-react';

interface Props { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (value: number) => void; onReset?: () => void }
export function RangeField({ label, value, min, max, step = 1, unit = '', onChange, onReset }: Props) {
  return <label className="range-field"><span className="field-label">{label}{onReset ? <button type="button" title={`Reset ${label}`} onClick={(event) => { event.preventDefault(); onReset(); }}><RotateCcw size={11} /></button> : null}</span><div className="range-field__controls"><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))}/><span className="range-field__value">{Number.isInteger(step) ? Math.round(value) : value.toFixed(1)}{unit}</span></div></label>;
}
