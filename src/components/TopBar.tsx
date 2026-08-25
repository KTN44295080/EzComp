import {
  Download,
  FilePlus2,
  FolderOpen,
  Hand,
  LoaderCircle,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { useEditorStore } from '../store/editorStore';

interface TopBarProps {
  onNew: () => void;
  onImport: () => void;
  onExport: () => void;
  onFit: () => void;
}

const clampZoom = (value: number): number => Math.min(8, Math.max(0.05, value));

export function TopBar({ onNew, onImport, onExport, onFit }: TopBarProps) {
  const tool = useEditorStore((state) => state.tool);
  const setTool = useEditorStore((state) => state.setTool);
  const viewport = useEditorStore((state) => state.viewport);
  const setViewport = useEditorStore((state) => state.setViewport);
  const hasLayers = useEditorStore((state) => state.layers.length > 0);
  const isImporting = useEditorStore((state) => state.isImporting);

  return (
    <header className="topbar">
      <div className="brand" aria-label="EzComp">
        <div className="brand__mark">E</div>
        <div>
          <strong>EzComp</strong>
          <span>local compositor</span>
        </div>
      </div>

      <div className="toolbar-group">
        <button className="icon-button" type="button" onClick={onNew} title="New composition">
          <FilePlus2 size={17} />
        </button>
        <button className="toolbar-button" type="button" onClick={onImport} disabled={isImporting}>
          {isImporting ? <LoaderCircle className="spin" size={17} /> : <FolderOpen size={17} />}
          Import
        </button>
        <button
          className="toolbar-button toolbar-button--primary"
          type="button"
          onClick={onExport}
          disabled={!hasLayers || isImporting}
        >
          <Download size={17} />
          Export PNG
        </button>
      </div>

      <div className="toolbar-separator" />

      <div className="segmented" aria-label="Editor tool">
        <button
          className={tool === 'move' ? 'is-active' : ''}
          type="button"
          onClick={() => setTool('move')}
          title="Move tool (V)"
        >
          <MousePointer2 size={17} />
        </button>
        <button
          className={tool === 'hand' ? 'is-active' : ''}
          type="button"
          onClick={() => setTool('hand')}
          title="Hand tool (H or hold Space)"
        >
          <Hand size={17} />
        </button>
      </div>

      <div className="topbar__spacer" />

      <div className="zoom-controls">
        <button
          className="icon-button"
          type="button"
          onClick={() => setViewport({ zoom: clampZoom(viewport.zoom / 1.2) })}
          title="Zoom out"
        >
          <Minus size={16} />
        </button>
        <span>{Math.round(viewport.zoom * 100)}%</span>
        <button
          className="icon-button"
          type="button"
          onClick={() => setViewport({ zoom: clampZoom(viewport.zoom * 1.2) })}
          title="Zoom in"
        >
          <Plus size={16} />
        </button>
        <button className="icon-button" type="button" onClick={onFit} title="Fit composition">
          <Maximize2 size={16} />
        </button>
      </div>

      <div className="privacy-chip" title="Files are processed in this browser">
        <ShieldCheck size={15} />
        Local only
      </div>
    </header>
  );
}
