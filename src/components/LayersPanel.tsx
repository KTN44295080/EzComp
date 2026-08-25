import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  ImagePlus,
  Layers3,
  Trash2,
} from 'lucide-react';
import { useEditorStore } from '../store/editorStore';

interface LayersPanelProps {
  onImport: () => void;
}

export function LayersPanel({ onImport }: LayersPanelProps) {
  const layers = useEditorStore((state) => state.layers);
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const selectLayer = useEditorStore((state) => state.selectLayer);
  const patchLayer = useEditorStore((state) => state.patchLayer);
  const removeLayer = useEditorStore((state) => state.removeLayer);
  const duplicateLayer = useEditorStore((state) => state.duplicateLayer);
  const moveLayer = useEditorStore((state) => state.moveLayer);

  const selectedIndex = layers.findIndex((layer) => layer.id === selectedLayerId);

  return (
    <aside className="panel panel--layers">
      <div className="panel__header">
        <div>
          <span className="panel__eyebrow">Composition</span>
          <h2>Layers</h2>
        </div>
        <button className="icon-button" type="button" onClick={onImport} title="Import layer">
          <ImagePlus size={17} />
        </button>
      </div>

      <div className="layer-list">
        {layers.length === 0 ? (
          <div className="panel-empty">
            <Layers3 size={27} />
            <strong>No layers</strong>
            <span>Import an image or PSD to begin.</span>
          </div>
        ) : (
          [...layers].reverse().map((layer) => (
            <button
              className={`layer-row ${selectedLayerId === layer.id ? 'is-selected' : ''}`}
              type="button"
              key={layer.id}
              onClick={() => selectLayer(layer.id)}
            >
              <span
                className="layer-row__visibility"
                role="button"
                tabIndex={0}
                title={layer.visible ? 'Hide layer' : 'Show layer'}
                onClick={(event) => {
                  event.stopPropagation();
                  patchLayer(layer.id, { visible: !layer.visible });
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    patchLayer(layer.id, { visible: !layer.visible });
                  }
                }}
              >
                {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
              </span>
              <span className="layer-row__thumbnail">
                {layer.thumbnailUrl ? <img src={layer.thumbnailUrl} alt="" /> : null}
              </span>
              <span className="layer-row__text">
                <strong>{layer.name}</strong>
                <small>{layer.sourcePath || `${layer.width} × ${layer.height}`}</small>
              </span>
            </button>
          ))
        )}
      </div>

      <div className="panel__footer layer-actions">
        <button
          className="icon-button"
          type="button"
          disabled={!selectedLayerId}
          onClick={() => selectedLayerId && duplicateLayer(selectedLayerId)}
          title="Duplicate layer"
        >
          <Copy size={16} />
        </button>
        <button
          className="icon-button"
          type="button"
          disabled={!selectedLayerId || selectedIndex >= layers.length - 1}
          onClick={() => selectedLayerId && moveLayer(selectedLayerId, 'up')}
          title="Move layer up"
        >
          <ArrowUp size={16} />
        </button>
        <button
          className="icon-button"
          type="button"
          disabled={!selectedLayerId || selectedIndex <= 0}
          onClick={() => selectedLayerId && moveLayer(selectedLayerId, 'down')}
          title="Move layer down"
        >
          <ArrowDown size={16} />
        </button>
        <span className="layer-actions__spacer" />
        <button
          className="icon-button icon-button--danger"
          type="button"
          disabled={!selectedLayerId}
          onClick={() => selectedLayerId && removeLayer(selectedLayerId)}
          title="Delete layer"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </aside>
  );
}
