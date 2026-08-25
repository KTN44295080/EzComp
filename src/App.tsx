import { useCallback, useRef, useState } from 'react';
import { EditorCanvas } from './components/EditorCanvas';
import { InspectorPanel } from './components/InspectorPanel';
import { LayersPanel } from './components/LayersPanel';
import { TopBar } from './components/TopBar';
import { clearAssets } from './lib/assets';
import { importFiles } from './lib/importers';
import { clearRasterCache, exportPng } from './lib/renderer';
import { useEditorStore } from './store/editorStore';

export default function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fitSignal, setFitSignal] = useState(0);

  const documentModel = useEditorStore((state) => state.document);
  const layers = useEditorStore((state) => state.layers);
  const message = useEditorStore((state) => state.message);
  const replaceProject = useEditorStore((state) => state.replaceProject);
  const appendLayers = useEditorStore((state) => state.appendLayers);
  const resetProject = useEditorStore((state) => state.resetProject);
  const setImporting = useEditorStore((state) => state.setImporting);
  const setMessage = useEditorStore((state) => state.setMessage);

  const openImportDialog = () => fileInputRef.current?.click();

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }
      setImporting(true);
      setMessage('Reading local files…');
      try {
        const state = useEditorStore.getState();
        const results = await importFiles(files, state.document, state.layers.length > 0);
        for (const result of results) {
          if (result.shouldReplaceProject && result.document) {
            replaceProject(result.document, result.layers);
          } else {
            appendLayers(result.layers);
          }
        }
        setFitSignal((value) => value + 1);
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Import failed.';
        setMessage(detail);
      } finally {
        setImporting(false);
      }
    },
    [appendLayers, replaceProject, setImporting, setMessage],
  );

  const handleNew = () => {
    if (layers.length > 0 && !window.confirm('Discard the current in-memory composition?')) {
      return;
    }
    clearAssets();
    clearRasterCache();
    resetProject();
    setFitSignal((value) => value + 1);
  };

  const handleExport = async () => {
    setMessage('Rendering full-resolution PNG…');
    try {
      await exportPng(documentModel, layers);
      setMessage(`Exported ${documentModel.width} × ${documentModel.height} PNG`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export failed.');
    }
  };

  return (
    <div className="app-shell">
      <TopBar
        onNew={handleNew}
        onImport={openImportDialog}
        onExport={handleExport}
        onFit={() => setFitSignal((value) => value + 1)}
      />

      <div className="workspace">
        <LayersPanel onImport={openImportDialog} />
        <EditorCanvas fitSignal={fitSignal} onFiles={handleFiles} onImport={openImportDialog} />
        <InspectorPanel />
      </div>

      <footer className="statusbar">
        <span>{documentModel.width} × {documentModel.height}px</span>
        <span>{layers.length} layer{layers.length === 1 ? '' : 's'}</span>
        <span className="statusbar__message">{message}</span>
        <span>Canvas 2D · sRGB preview</span>
      </footer>

      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept=".psd,image/png,image/jpeg,image/webp"
        multiple
        onChange={(event) => {
          handleFiles(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = '';
        }}
      />
    </div>
  );
}
