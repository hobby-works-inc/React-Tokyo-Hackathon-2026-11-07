'use client';
// 開発者・審査員向けパネル。data-ai-ignore によりこのパネルの操作は買い物行動の集計に含めない。
import { useState } from 'react';
import { engine } from './engine';
import { useDemo } from './store';

export function DevPanel() {
  const open = useDemo((s) => s.devPanelOpen);
  const log = useDemo((s) => s.devLog);
  const widgets = useDemo((s) => s.widgets);
  const rev = useDemo((s) => `epoch ${s.epoch} / state ${s.stateRevision} / ui ${s.uiRevision} / mode ${s.mode}#${s.modeRevision}`);
  const server = useDemo((s) => s.server);
  const lastSkip = useDemo((s) => s.lastSkip);
  const [sel, setSel] = useState<string | null>(null);
  const [, force] = useState(0);
  if (!open) return null;
  const entry = log.find((e) => e.requestId === sel) ?? log[log.length - 1];
  const stats = engine.controller?.stats;
  return (
    <aside className="devpanel" data-ai-ignore data-testid="devpanel">
      <div className="dp-head">
        <b>開発者パネル</b>
        <span className="small">
          {server?.mode === 'live' ? `LIVE ${server.model}` : 'MOCK'} · {rev}
        </span>
        <button className="small" onClick={() => force((n) => n + 1)}>
          更新
        </button>
      </div>
      <div className="small muted">
        送信: {stats?.dispatched ?? 0} / キャンセル: {stats?.aborted ?? 0} / 非表示でスキップ: {stats?.skippedHidden ?? 0} / 情報なし: {stats?.skippedNoInfo ?? 0} / 無操作上限: {stats?.skippedIdleLimit ?? 0}
        {lastSkip ? ` · 最後のスキップ: ${lastSkip}` : ''}
      </div>
      <h4>ウィジェット</h4>
      <ul className="small" data-testid="dp-widgets">
        {widgets.map((w) => (
          <li key={w.id}>
            {w.id} @ {w.slot} · 表示 v{w.active?.version ?? '-'} {w.pending ? `· 確認中 v${w.pending.version}` : ''} {w.lastError ? <span className="ng">· エラー: {w.lastError}</span> : null}
          </li>
        ))}
      </ul>
      <h4>リクエスト</h4>
      <div className="dp-log" data-testid="dp-log">
        {[...log].reverse().map((e) => (
          <button key={e.requestId} className={`dp-row ${entry?.requestId === e.requestId ? 'sel' : ''}`} onClick={() => setSel(e.requestId)}>
            <span>{e.trigger}</span>
            <span className={`st-${e.status}`} data-status={e.status}>
              {e.status}
            </span>
            <span>{e.response?.ok ? e.response.decision.action : ''}</span>
            <span>{e.latencyMs != null ? `${e.latencyMs}ms` : ''}</span>
            <span className="ng">{e.note ?? ''}</span>
          </button>
        ))}
      </div>
      {entry ? (
        <div className="dp-detail">
          <h4>エリア別の観測（差分期間 {Math.round((entry.input.deltaWindow.toMs - entry.input.deltaWindow.fromMs) / 100) / 10}秒）</h4>
          <table className="dp-table">
            <thead>
              <tr>
                <th>エリア</th>
                <th>表示率</th>
                <th>表示ms</th>
                <th>上部帯ms</th>
                <th>カーソルms</th>
                <th>停止ms</th>
                <th>再訪</th>
                <th>クリック</th>
              </tr>
            </thead>
            <tbody>
              {entry.input.regions.map((r) => (
                <tr key={r.id}>
                  <td>{r.label}</td>
                  <td>{r.visibleRatio}</td>
                  <td>{r.visibleMs}</td>
                  <td>{r.upperBandExposureMs}</td>
                  <td>{r.cursorDwellMs ?? '—'}</td>
                  <td>{r.cursorStationaryMs ?? '—'}</td>
                  <td>{r.revisitCount}</td>
                  <td>{r.clickCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {entry.response?.ok ? (
            <>
              <h4>AIの判断（{entry.response.source} · {entry.response.model} · 試行 {entry.response.attempts}回）</h4>
              <p className="small">{entry.response.decision.explanation}</p>
              {entry.response.droppedEvidenceRefs.length ? <p className="small ng">入力に存在しない根拠参照を除外: {entry.response.droppedEvidenceRefs.join(', ')}</p> : null}
              {entry.response.decision.action === 'upsert_widget' ? (
                <details>
                  <summary className="small">生成コード（{entry.response.decision.widget.id}）</summary>
                  <pre className="code">{entry.response.decision.widget.sourceTsx}</pre>
                </details>
              ) : null}
            </>
          ) : entry.response ? (
            <p className="ng small">エラー: {entry.response.error}</p>
          ) : null}
          <details>
            <summary className="small">LLMに送ったデータ（JSON）</summary>
            <pre className="code" data-testid="dp-input">{JSON.stringify(entry.input, null, 2)}</pre>
          </details>
        </div>
      ) : null}
    </aside>
  );
}
