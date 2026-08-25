import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { RangeField } from './RangeField';
import { useEditorStore } from '../store/editorStore';
import { blendModes, defaultAdjustments, type BlendMode } from '../types/editor';

interface NumberFieldProps {
  label: string;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}

function NumberField({ label, value, step = 1, onChange }: NumberFieldProps) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        type="number"
        value={Number.isInteger(value) ? value : Number(value.toFixed(2))}
        step={step}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

const blendLabels: Record<BlendMode, string> = {
  'source-over': 'Normal',
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay',
  'soft-light': 'Soft Light',
  'hard-light': 'Hard Light',
  'color-dodge': 'Color Dodge',
  'color-burn': 'Color Burn',
  darken: 'Darken',
  lighten: 'Lighten',
  difference: 'Difference',
  exclusion: 'Exclusion',
  hue: 'Hue',
  saturation: 'Saturation',
  color: 'Color',
  luminosity: 'Luminosity',
};

export function InspectorPanel() {
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const selectedLayer = useEditorStore((state) =>
    state.layers.find((layer) => layer.id === state.selectedLayerId),
  );
  const documentModel = useEditorStore((state) => state.document);
  const patchLayer = useEditorStore((state) => state.patchLayer);
  const patchTransform = useEditorStore((state) => state.patchLayerTransform);
  const patchAdjustments = useEditorStore((state) => state.patchLayerAdjustments);
  const setDocument = useEditorStore((state) => state.setDocument);

  return (
    <aside className="panel panel--inspector">
      <div className="panel__header">
        <div>
          <span className="panel__eyebrow">Properties</span>
          <h2>{selectedLayer ? 'Layer' : 'Document'}</h2>
        </div>
        <SlidersHorizontal size={18} />
      </div>

      <div className="inspector-scroll">
        {!selectedLayer || !selectedLayerId ? (
          <section className="inspector-section">
            <h3>Canvas</h3>
            <label className="text-field">
              <span>Name</span>
              <input
                value={documentModel.name}
                onChange={(event) => setDocument({ name: event.currentTarget.value })}
              />
            </label>
            <div className="field-grid field-grid--two">
              <NumberField
                label="Width"
                value={documentModel.width}
                onChange={(width) => setDocument({ width: Math.max(1, Math.round(width)) })}
              />
              <NumberField
                label="Height"
                value={documentModel.height}
                onChange={(height) => setDocument({ height: Math.max(1, Math.round(height)) })}
              />
            </div>
            <label className="select-field">
              <span>Background</span>
              <select
                value={documentModel.background}
                onChange={(event) =>
                  setDocument({
                    background: event.currentTarget.value as typeof documentModel.background,
                  })
                }
              >
                <option value="transparent">Transparent</option>
                <option value="black">Black</option>
                <option value="white">White</option>
              </select>
            </label>
            <p className="inspector-note">
              Imported pixels remain untouched. Adjustments are evaluated during preview and export.
            </p>
          </section>
        ) : (
          <>
            <section className="inspector-section">
              <h3>Identity</h3>
              <label className="text-field">
                <span>Name</span>
                <input
                  value={selectedLayer.name}
                  onChange={(event) => patchLayer(selectedLayerId, { name: event.currentTarget.value })}
                />
              </label>
              <label className="select-field">
                <span>Blend</span>
                <select
                  value={selectedLayer.blendMode}
                  onChange={(event) =>
                    patchLayer(selectedLayerId, {
                      blendMode: event.currentTarget.value as BlendMode,
                    })
                  }
                >
                  {blendModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {blendLabels[mode]}
                    </option>
                  ))}
                </select>
              </label>
              <RangeField
                label="Opacity"
                value={selectedLayer.opacity}
                min={0}
                max={100}
                unit="%"
                onChange={(opacity) => patchLayer(selectedLayerId, { opacity })}
              />
            </section>

            <section className="inspector-section">
              <h3>Transform</h3>
              <div className="field-grid field-grid--two">
                <NumberField
                  label="X"
                  value={selectedLayer.transform.x}
                  onChange={(x) => patchTransform(selectedLayerId, { x })}
                />
                <NumberField
                  label="Y"
                  value={selectedLayer.transform.y}
                  onChange={(y) => patchTransform(selectedLayerId, { y })}
                />
                <NumberField
                  label="Scale X %"
                  value={selectedLayer.transform.scaleX * 100}
                  step={0.1}
                  onChange={(scaleX) =>
                    patchTransform(selectedLayerId, { scaleX: Math.max(0.001, scaleX / 100) })
                  }
                />
                <NumberField
                  label="Scale Y %"
                  value={selectedLayer.transform.scaleY * 100}
                  step={0.1}
                  onChange={(scaleY) =>
                    patchTransform(selectedLayerId, { scaleY: Math.max(0.001, scaleY / 100) })
                  }
                />
              </div>
              <NumberField
                label="Rotation °"
                value={selectedLayer.transform.rotation}
                step={0.1}
                onChange={(rotation) => patchTransform(selectedLayerId, { rotation })}
              />
            </section>

            <section className="inspector-section">
              <div className="section-title-row">
                <h3>Color match</h3>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => patchAdjustments(selectedLayerId, defaultAdjustments())}
                >
                  <RotateCcw size={14} />
                  Reset
                </button>
              </div>
              <RangeField
                label="Exposure"
                value={selectedLayer.adjustments.exposure}
                min={-3}
                max={3}
                step={0.1}
                unit=" EV"
                onChange={(exposure) => patchAdjustments(selectedLayerId, { exposure })}
              />
              <RangeField
                label="Contrast"
                value={selectedLayer.adjustments.contrast}
                min={-100}
                max={100}
                onChange={(contrast) => patchAdjustments(selectedLayerId, { contrast })}
              />
              <RangeField
                label="Saturation"
                value={selectedLayer.adjustments.saturation}
                min={-100}
                max={100}
                onChange={(saturation) => patchAdjustments(selectedLayerId, { saturation })}
              />
              <RangeField
                label="Temperature"
                value={selectedLayer.adjustments.temperature}
                min={-100}
                max={100}
                onChange={(temperature) => patchAdjustments(selectedLayerId, { temperature })}
              />
              <RangeField
                label="Tint"
                value={selectedLayer.adjustments.tint}
                min={-100}
                max={100}
                onChange={(tint) => patchAdjustments(selectedLayerId, { tint })}
              />
              <RangeField
                label="Blur"
                value={selectedLayer.adjustments.blur}
                min={0}
                max={40}
                step={0.5}
                unit=" px"
                onChange={(blur) => patchAdjustments(selectedLayerId, { blur })}
              />
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
