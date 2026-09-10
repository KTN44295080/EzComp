import { useState, type PointerEvent } from 'react';
import { useEditorStore } from '../store/editorStore';
import { clamp, effectivelyVisible, fromWorld, groundingDefaults, normalizeGrounding, receiverFor, toWorld, type ContactPoint, type GroundingPreset, type GroundingSettings } from '../lib/grounding';
import { analyseGroundingLayer, sampleGroundColor } from '../lib/groundingRaster';
import type { RasterLayer } from '../types/editor';
import './GroundingControls.css';

export function GroundingControls({ size }: { size: { width: number; height: number } }) {
  const layers = useEditorStore(s => s.layers), selectedId = useEditorStore(s => s.selectedLayerId), doc = useEditorStore(s => s.document), viewport = useEditorStore(s => s.viewport), compare = useEditorStore(s => s.compareBefore);
  const patch = useEditorStore(s => s.patchLayer), begin = useEditorStore(s => s.beginTransaction), end = useEditorStore(s => s.endTransaction), message = useEditorStore(s => s.setMessage), error = useEditorStore(s => s.setError);
  const [preset, setPreset] = useState<GroundingPreset>('natural'), [busy, setBusy] = useState(false), [editingId, setEditingId] = useState<string | null>(null), [report, setReport] = useState('');
  const layer = layers.find(l => l.id === selectedId && l.kind !== 'group'), settings = normalizeGrounding(layer?.grounding ?? groundingDefaults(preset));
  const editable = (l: RasterLayer) => { let current: RasterLayer | undefined = l; const visited = new Set<string>(); while (current) { if (current.locked || visited.has(current.id)) return false; visited.add(current.id); current = layers.find(p => p.id === current?.parentId); } return true; };
  const canEdit = Boolean(layer && editable(layer) && !busy && !compare);
  const update = (value: Partial<GroundingSettings>) => { if (layer && canEdit) patch(layer.id, { grounding: normalizeGrounding({ ...settings, ...value }) }); };
  const updatePoint = (id: string, value: Partial<ContactPoint>) => update({ points: settings.points.map(p => p.id === id ? { ...p, ...value } : p), confidence: 'manual' });
  const automatic = async (all: boolean) => {
    if (busy || compare) return; setBusy(true); setReport('輪郭と床の色を解析しています…'); error(null);
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const candidates = all ? layers : layer ? [layer] : [], edits: { id: string; grounding: GroundingSettings }[] = [], skipped: string[] = [];
      for (const candidate of candidates) {
        if (candidate.kind === 'group' || !effectivelyVisible(candidate, layers) || !editable(candidate)) continue;
        if (all && candidate.grounding?.confidence === 'manual') { skipped.push(`${candidate.name}：手動調整を維持`); continue; }
        const current = normalizeGrounding(candidate.grounding), receiver = receiverFor(candidate, layers);
        if (!receiver) { if (!all) skipped.push('先に床・背景レイヤーを下に配置してください。'); continue; }
        if (all && (candidate.blendMode !== 'source-over' || candidate.opacity < 50 || /shadow|影|logo|ロゴ|glow|光/i.test(candidate.name))) continue;
        const result = analyseGroundingLayer(candidate);
        if (!result.points.length || (all && result.confidence === 'review')) { skipped.push(`${candidate.name}：${result.note}`); continue; }
        const next = { ...groundingDefaults(preset), enabled: true, receiverId: current.receiverId, points: result.points, confidence: result.confidence, note: result.note };
        const color = sampleGroundColor(candidate, receiver, result.points); if (preset === 'natural' && color) next.color = color;
        edits.push({ id: candidate.id, grounding: next });
      }
      if (useEditorStore.getState().layers !== layers) throw new Error('解析中にレイヤーが変更されました。もう一度実行してください。');
      if (edits.length) { begin(); try { for (const edit of edits) patch(edit.id, { grounding: edit.grounding }); } finally { end(); } }
      const result = `${edits.length}レイヤーの接地を更新。${skipped.length ? ` 要確認・保持：${skipped.length}件。` : ''}`;
      message(result); setReport(result + (skipped.length ? '\n' + skipped.join('\n') : ''));
      if (!all && layer && edits.length) setEditingId(layer.id);
    } catch (cause) { error(cause instanceof Error ? cause.message : '接地解析に失敗しました。'); setReport('変更は適用されていません。'); }
    finally { setBusy(false); }
  };
  const addPoint = () => { if (!layer || settings.points.length >= 8) return; const p = settings.points.at(-1); update({ enabled: true, confidence: 'manual', points: [...settings.points, { id: crypto.randomUUID(), x: p ? clamp(p.x + .1) : .5, y: p?.y ?? .95, width: p?.width ?? .06, weight: 1 }] }); setEditingId(layer.id); };
  const dragPoint = (event: PointerEvent<HTMLButtonElement>, point: ContactPoint) => {
    if (!layer || !canEdit) return;
    event.preventDefault(); event.stopPropagation(); const button = event.currentTarget, start = { x: event.clientX, y: event.clientY }, initial = toWorld(layer, point);
    begin(); button.setPointerCapture(event.pointerId);
    const move = (e: globalThis.PointerEvent) => { if (e.pointerId !== event.pointerId) return; const local = fromWorld(layer, { x: initial.x + (e.clientX - start.x) / viewport.zoom, y: initial.y + (e.clientY - start.y) / viewport.zoom }); updatePoint(point.id, { x: clamp(local.x), y: clamp(local.y) }); };
    const finish = (e: globalThis.PointerEvent) => { if (e.pointerId !== event.pointerId) return; button.removeEventListener('pointermove', move); button.removeEventListener('pointerup', finish); button.removeEventListener('pointercancel', finish); button.removeEventListener('lostpointercapture', finish); end(); };
    button.addEventListener('pointermove', move); button.addEventListener('pointerup', finish); button.addEventListener('pointercancel', finish); button.addEventListener('lostpointercapture', finish);
  };
  const slider = (label: string, key: 'strength' | 'contact' | 'ao' | 'spread' | 'softness' | 'glow' | 'bounce' | 'angle', min = 0, max = 100) => <label className="grounding-range"><span>{label}<output>{Math.round(settings[key])}</output></span><input type="range" min={min} max={max} value={settings[key]} disabled={!canEdit} onPointerDown={begin} onPointerUp={end} onPointerCancel={end} onBlur={end} onChange={e => update({ [key]: Number(e.currentTarget.value) })}/></label>;
  if (!layers.length) return null;
  return <>
    <details className="grounding-panel" data-grounding-ui="true"><summary>接地・なじませ <small>Auto Grounding</small></summary><div className="grounding-content">
      <p>輪郭から接地点を推定し、接触影・AO・床の反射色をまとめて調整します。画像はブラウザー内で処理します。</p>
      <label>仕上がり<select aria-label="接地プリセット" value={preset} onChange={e => setPreset(e.currentTarget.value as GroundingPreset)}><option value="natural">自然な接地／床色から推定</option><option value="ice">幻想的な水色／発光影</option><option value="warm">暖色の影</option></select></label>
      <div className="grounding-actions"><button type="button" disabled={!canEdit} onClick={() => void automatic(false)}>選択を自動接地</button><button type="button" disabled={busy || compare} onClick={() => void automatic(true)}>表示中をまとめて</button></div>
      {report && <p className="grounding-report" role="status">{report}</p>}
      {layer && <fieldset disabled={!canEdit}><legend>{layer.name}</legend>
        <div className="grounding-actions"><label><input type="checkbox" checked={settings.enabled} onChange={e => update({ enabled: e.currentTarget.checked })}/> 有効</label><button type="button" onClick={() => update({ ...groundingDefaults(preset) })}>接地だけリセット</button></div>
        {slider('全体の強さ', 'strength')}{slider('靴底の接触影', 'contact')}
        <label><input type="checkbox" checked={editingId === layer.id} onChange={e => setEditingId(e.currentTarget.checked ? layer.id : null)}/> 接地点を表示・ドラッグ</label>
        <p className="grounding-note">{settings.note || '自動検出後、丸いマーカーを靴底へドラッグできます。'}{settings.confidence === 'review' && settings.points.length ? ' 要確認' : ''}</p>
        <details><summary>詳細・片足ごとの調整</summary>
          <label>影を受ける床<select value={settings.receiverId ?? ''} onChange={e => update({ receiverId: e.currentTarget.value || null })}><option value="">自動（最下層の表示画像）</option>{layers.slice(0, layers.indexOf(layer)).filter(l => l.kind !== 'group' && effectivelyVisible(l, layers)).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          {slider('足元のAO', 'ao')}{slider('影の広がり', 'spread', 20, 250)}{slider('影の柔らかさ', 'softness')}{slider('床の傾き', 'angle', -80, 80)}
          <label>広がる影の色<input type="color" value={settings.color} onChange={e => update({ color: e.currentTarget.value })}/></label>
          <label>広がる影の合成<select value={settings.blend} onChange={e => update({ blend: e.currentTarget.value as GroundingSettings['blend'] })}><option value="multiply">乗算</option><option value="soft-light">ソフトライト</option><option value="screen">スクリーン</option><option value="overlay">オーバーレイ</option></select></label>
          {slider('水色のにじみ', 'glow')}{slider('足元への反射色', 'bounce')}
          <p>暗い接触影は独立して維持します。発光影を選んでも、靴底まで白く消えない構成です。</p>
          {settings.points.map((p, i) => <div className="grounding-point-row" key={p.id}><strong>接地点 {i + 1}</strong><button type="button" aria-label={`接地点${i + 1}を削除`} onClick={() => update({ confidence: 'manual', points: settings.points.filter(v => v.id !== p.id) })}>削除</button>{(['x', 'y', 'width', 'weight'] as const).map((key, k) => <label key={key}>{['X %', 'Y %', '幅 %', '接地率 %'][k]}<input type="number" min={key === 'width' ? .2 : 0} max={key === 'width' ? 80 : 100} step={.1} value={Number((p[key] * 100).toFixed(2))} onChange={e => updatePoint(p.id, { [key]: Number(e.currentTarget.value) / 100 })}/></label>)}</div>)}
          <button type="button" disabled={settings.points.length >= 8} onClick={addPoint}>接地点を追加</button>
          <p>接地率0％で浮いている足の影を無効化できます。手動で直したレイヤーは一括処理で上書きしません。</p>
        </details>
      </fieldset>}
      <p className="grounding-note">2Dの推定です。長い裾・髪・切れた足元は確認が必要です。別レイヤーに焼き込まれた影は自動削除しません。</p>
    </div></details>
    {layer && canEdit && settings.enabled && editingId === layer.id && settings.points.map((point, i) => {
      const world = toWorld(layer, point), x = (world.x - doc.width / 2) * viewport.zoom + size.width / 2 + viewport.panX, y = (world.y - doc.height / 2) * viewport.zoom + size.height / 2 + viewport.panY;
      return <button key={point.id} type="button" className="grounding-anchor" data-grounding-ui="true" style={{ left: x, top: y }} title={`接地点 ${i + 1}：ドラッグで移動／矢印キーで微調整`} aria-label={`接地点 ${i + 1}`} onPointerDown={e => dragPoint(e, point)} onKeyDown={e => { if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return; e.preventDefault(); e.stopPropagation(); const n = e.shiftKey ? 10 : 1; updatePoint(point.id, fromWorld(layer, { x: world.x + (e.key === 'ArrowRight' ? n : e.key === 'ArrowLeft' ? -n : 0), y: world.y + (e.key === 'ArrowDown' ? n : e.key === 'ArrowUp' ? -n : 0) })); }}>{i + 1}</button>;
    })}
  </>;
}
