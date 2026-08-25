import { ImagePlus, MousePointer2, ShieldCheck } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { fitZoom, pointInsideLayer, screenToDocument, type Point } from '../lib/geometry';
import { drawComposition, drawDocumentSurface } from '../lib/renderer';
import { useEditorStore } from '../store/editorStore';

interface EditorCanvasProps {
  fitSignal: number;
  onFiles: (files: File[]) => void;
  onImport: () => void;
}

type DragState =
  | {
      kind: 'pan';
      pointerId: number;
      startScreen: Point;
      startPan: Point;
    }
  | {
      kind: 'move';
      pointerId: number;
      layerId: string;
      startDocument: Point;
      startPosition: Point;
    };

const clampZoom = (value: number): number => Math.min(8, Math.max(0.05, value));

function isTextInput(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function EditorCanvas({ fitSignal, onFiles, onImport }: EditorCanvasProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const spacePressedRef = useRef(false);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [isFileHover, setFileHover] = useState(false);
  const [isInteracting, setInteracting] = useState(false);

  const documentModel = useEditorStore((state) => state.document);
  const layers = useEditorStore((state) => state.layers);
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const viewport = useEditorStore((state) => state.viewport);
  const tool = useEditorStore((state) => state.tool);
  const selectLayer = useEditorStore((state) => state.selectLayer);
  const patchTransform = useEditorStore((state) => state.patchLayerTransform);
  const removeLayer = useEditorStore((state) => state.removeLayer);
  const setViewport = useEditorStore((state) => state.setViewport);
  const setTool = useEditorStore((state) => state.setTool);

  const fitToView = useCallback(() => {
    setViewport({
      zoom: fitZoom(size, documentModel),
      panX: 0,
      panY: 0,
    });
  }, [documentModel, setViewport, size]);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return undefined;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      setSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      });
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    fitToView();
  }, [fitSignal, documentModel.width, documentModel.height, size.width, size.height, fitToView]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(size.width * devicePixelRatio));
    canvas.height = Math.max(1, Math.round(size.height * devicePixelRatio));
    const context = canvas.getContext('2d');
    if (!context) {
      return undefined;
    }

    const frame = requestAnimationFrame(() => {
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      context.clearRect(0, 0, size.width, size.height);
      context.fillStyle = '#18191e';
      context.fillRect(0, 0, size.width, size.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';

      context.save();
      context.translate(size.width / 2 + viewport.panX, size.height / 2 + viewport.panY);
      context.scale(viewport.zoom, viewport.zoom);
      context.translate(-documentModel.width / 2, -documentModel.height / 2);
      drawDocumentSurface(context, documentModel);
      drawComposition(context, documentModel, layers);

      const selected = layers.find((layer) => layer.id === selectedLayerId);
      if (selected?.visible) {
        const { transform } = selected;
        const centerX = transform.x + (selected.width * transform.scaleX) / 2;
        const centerY = transform.y + (selected.height * transform.scaleY) / 2;
        context.save();
        context.globalCompositeOperation = 'source-over';
        context.translate(centerX, centerY);
        context.rotate((transform.rotation * Math.PI) / 180);
        context.scale(transform.scaleX, transform.scaleY);
        context.strokeStyle = '#7ea7ff';
        context.lineWidth = 1.5 / Math.max(viewport.zoom, 0.001);
        context.setLineDash([
          7 / Math.max(viewport.zoom, 0.001),
          4 / Math.max(viewport.zoom, 0.001),
        ]);
        context.strokeRect(
          -selected.width / 2,
          -selected.height / 2,
          selected.width,
          selected.height,
        );
        context.restore();
      }
      context.restore();
    });

    return () => cancelAnimationFrame(frame);
  }, [documentModel, layers, selectedLayerId, size, viewport]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextInput(event.target)) {
        return;
      }
      if (event.code === 'Space') {
        spacePressedRef.current = true;
        event.preventDefault();
      }
      if (event.key.toLowerCase() === 'v') {
        setTool('move');
      }
      if (event.key.toLowerCase() === 'h') {
        setTool('hand');
      }
      if (event.key === '0') {
        fitToView();
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedLayerId) {
        event.preventDefault();
        removeLayer(selectedLayerId);
      }
      if (selectedLayerId && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        const state = useEditorStore.getState();
        const layer = state.layers.find((candidate) => candidate.id === selectedLayerId);
        if (!layer || layer.locked) {
          return;
        }
        event.preventDefault();
        const amount = event.shiftKey ? 10 : 1;
        const next = { x: layer.transform.x, y: layer.transform.y };
        if (event.key === 'ArrowLeft') next.x -= amount;
        if (event.key === 'ArrowRight') next.x += amount;
        if (event.key === 'ArrowUp') next.y -= amount;
        if (event.key === 'ArrowDown') next.y += amount;
        patchTransform(selectedLayerId, next);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spacePressedRef.current = false;
      }
    };
    const handlePaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith('image/'),
      );
      if (files.length > 0) {
        event.preventDefault();
        onFiles(files);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('paste', handlePaste);
    };
  }, [fitToView, onFiles, patchTransform, removeLayer, selectedLayerId, setTool]);

  const canvasPoint = (event: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.button !== 1) {
      return;
    }
    const screen = canvasPoint(event);
    const shouldPan = event.button === 1 || tool === 'hand' || spacePressedRef.current;
    if (shouldPan) {
      dragRef.current = {
        kind: 'pan',
        pointerId: event.pointerId,
        startScreen: screen,
        startPan: { x: viewport.panX, y: viewport.panY },
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setInteracting(true);
      return;
    }

    const documentPoint = screenToDocument(screen, size, documentModel, viewport);
    const hit = [...layers]
      .reverse()
      .find((layer) => layer.visible && pointInsideLayer(documentPoint, layer));

    if (!hit) {
      selectLayer(null);
      return;
    }

    selectLayer(hit.id);
    if (hit.locked) {
      return;
    }
    dragRef.current = {
      kind: 'move',
      pointerId: event.pointerId,
      layerId: hit.id,
      startDocument: documentPoint,
      startPosition: { x: hit.transform.x, y: hit.transform.y },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setInteracting(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const screen = canvasPoint(event);
    if (drag.kind === 'pan') {
      setViewport({
        panX: drag.startPan.x + screen.x - drag.startScreen.x,
        panY: drag.startPan.y + screen.y - drag.startScreen.y,
      });
      return;
    }
    const documentPoint = screenToDocument(screen, size, documentModel, viewport);
    patchTransform(drag.layerId, {
      x: drag.startPosition.x + documentPoint.x - drag.startDocument.x,
      y: drag.startPosition.y + documentPoint.y - drag.startDocument.y,
    });
  };

  const finishPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setInteracting(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const screen = canvasPoint(event);
    const documentPoint = screenToDocument(screen, size, documentModel, viewport);
    const nextZoom = clampZoom(viewport.zoom * Math.exp(-event.deltaY * 0.0015));
    setViewport({
      zoom: nextZoom,
      panX:
        screen.x -
        size.width / 2 -
        (documentPoint.x - documentModel.width / 2) * nextZoom,
      panY:
        screen.y -
        size.height / 2 -
        (documentPoint.y - documentModel.height / 2) * nextZoom,
    });
  };

  return (
    <main
      ref={shellRef}
      className={`canvas-shell ${isFileHover ? 'is-file-hover' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setFileHover(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setFileHover(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setFileHover(false);
        onFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <canvas
        ref={canvasRef}
        className={`editor-canvas tool-${tool} ${isInteracting ? 'is-interacting' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onWheel={handleWheel}
        onContextMenu={(event) => event.preventDefault()}
      />

      {layers.length === 0 ? (
        <div className="empty-canvas">
          <div className="empty-canvas__icon">
            <MousePointer2 size={24} />
          </div>
          <h1>Build the composite from existing pixels.</h1>
          <p>Drop a PSD, PNG, JPEG, or WebP. Files stay in this browser.</p>
          <button className="toolbar-button toolbar-button--primary" type="button" onClick={onImport}>
            <ImagePlus size={18} />
            Import artwork
          </button>
          <span>
            <ShieldCheck size={14} /> No upload. No image regeneration.
          </span>
        </div>
      ) : null}

      {isFileHover ? (
        <div className="drop-overlay">
          <ImagePlus size={30} />
          <strong>Drop to import</strong>
        </div>
      ) : null}
    </main>
  );
}
