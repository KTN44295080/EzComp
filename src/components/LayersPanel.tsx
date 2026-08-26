/* eslint-disable @next/next/no-img-element -- thumbnails are browser-local object/data URLs */
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Eye, EyeOff, Folder, FolderOpen, ImagePlus, Layers3, Lock, LockOpen, Trash2 } from 'lucide-react';
import { isLayerEffectivelyVisible } from '../lib/renderer';
import { useEditorStore } from '../store/editorStore';
import type { RasterLayer } from '../types/editor';
import { AutoCompositeControls } from './AutoCompositeControls';

function hasCollapsedAncestor(layer: RasterLayer, byId: Map<string, RasterLayer>): boolean {
  const visited = new Set<string>();
  let parentId = layer.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    if (parent.kind === 'group' && parent.expanded === false) return true;
    parentId = parent.parentId;
  }
  return false;
}

export function LayersPanel({ onImport }: { onImport: () => void }) {
  const layers = useEditorStore((state) => state.layers), selected = useEditorStore((state) => state.selectedLayerId), select = useEditorStore((state) => state.selectLayer), patch = useEditorStore((state) => state.patchLayer), remove = useEditorStore((state) => state.removeLayer), duplicate = useEditorStore((state) => state.duplicateLayer), move = useEditorStore((state) => state.moveLayer);
  const index = layers.findIndex((layer) => layer.id === selected), selectedLayer = layers[index], byId = new Map(layers.map((layer) => [layer.id, layer]));
  const ordered = [...layers].reverse().filter((layer) => !hasCollapsedAncestor(layer, byId));
  const canReorder = Boolean(selectedLayer && selectedLayer.kind !== 'group' && !selectedLayer.parentId);
  return <aside className="panel panel--layers">
    <div className="panel__header"><div><span className="panel__eyebrow">Composition</span><h2>Layers</h2></div><button className="icon-button" type="button" onClick={onImport} title="Import layer"><ImagePlus size={17}/></button></div>
    <AutoCompositeControls compact/>
    <div className="layer-list">{layers.length === 0 ? <div className="panel-empty"><Layers3 size={28}/><strong>No layers yet</strong><span>Drop a PSD or image onto the canvas.</span><button type="button" className="text-button" onClick={onImport}>Choose files</button></div> : ordered.map((layer) => {
      const isGroup = layer.kind === 'group', effectiveVisible = isLayerEffectivelyVisible(layer, layers), inheritedHidden = layer.visible && !effectiveVisible;
      const childCount = isGroup ? layers.filter((candidate) => candidate.parentId === layer.id).length : 0;
      return <button className={`layer-row ${isGroup ? 'is-group' : ''} ${inheritedHidden ? 'is-inherited-hidden' : ''} ${selected === layer.id ? 'is-selected' : ''}`} style={{ paddingLeft: 4 + (layer.depth ?? 0) * 13 }} type="button" key={layer.id} onClick={() => select(layer.id)}><span className="layer-row__buttons"><span role="button" tabIndex={0} title={layer.visible ? 'Hide layer' : 'Show layer'} onClick={(event) => { event.stopPropagation(); patch(layer.id, { visible: !layer.visible }); }}>{effectiveVisible ? <Eye size={14}/> : <EyeOff size={14}/>}</span><span role="button" tabIndex={0} title={layer.locked ? 'Unlock layer' : 'Lock layer'} onClick={(event) => { event.stopPropagation(); patch(layer.id, { locked: !layer.locked }); }}>{layer.locked ? <Lock size={12}/> : <LockOpen size={12}/>}</span></span>{isGroup ? <span className="layer-row__thumbnail layer-row__folder"><span className="layer-row__disclosure" role="button" tabIndex={0} title={layer.expanded === false ? 'Expand group' : 'Collapse group'} onClick={(event) => { event.stopPropagation(); patch(layer.id, { expanded: layer.expanded === false }); }}>{layer.expanded === false ? <ChevronRight size={13}/> : <ChevronDown size={13}/>}</span>{layer.expanded === false ? <Folder size={19}/> : <FolderOpen size={19}/>}</span> : <span className="layer-row__thumbnail">{layer.thumbnailUrl ? <img src={layer.thumbnailUrl} alt=""/> : null}</span>}<span className="layer-row__text"><strong>{layer.name}</strong><small>{isGroup ? `${childCount} item${childCount === 1 ? '' : 's'}` : layer.sourcePath || `${layer.width} × ${layer.height}`}</small></span></button>;
    })}</div>
    <div className="panel__footer layer-actions"><button className="icon-button" type="button" disabled={!selectedLayer || !canReorder} onClick={() => selected && duplicate(selected)} title="Duplicate top-level layer (Ctrl+D)"><Copy size={16}/></button><button className="icon-button" type="button" disabled={!canReorder || index >= layers.length - 1} onClick={() => selected && move(selected,'up')} title="Move up"><ArrowUp size={16}/></button><button className="icon-button" type="button" disabled={!canReorder || index <= 0} onClick={() => selected && move(selected,'down')} title="Move down"><ArrowDown size={16}/></button><span className="layer-actions__spacer"/><button className="icon-button danger" type="button" disabled={!selected} onClick={() => selected && remove(selected)} title={selectedLayer?.kind === 'group' ? 'Delete group and contents' : 'Delete'}><Trash2 size={16}/></button></div>
  </aside>;
}
