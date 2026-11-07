'use client';
// 種明かし: 観測事実 → AIの仮説 → 生成したUI → その後の観測 を時系列で表示する。
// 「見ていた」「この表示のせいで購入した」とは断定しない。
import { useState } from 'react';
import { useRouter } from 'waku';
import { SCENARIO } from '../lib/scenario';
import { engine } from './engine';
import { store, useDemo, type InterventionLog } from './store';

const FOLLOW_LABEL: Record<string, string> = {
  widget_dismiss: '生成UIを閉じた',
  widget_option_change: '生成UIで追加オプションを変更した',
  option_toggle: '購入欄で追加オプションを変更した',
  cart_add: 'カートに追加した',
  cart_remove: 'カートから削除した',
  quantity_change: '数量を変更した',
  checkout: '模擬注文を確定した',
  widget_hover: '生成UIの上にカーソルを置いた',
  widget_shown: '生成UIが表示された',
  widget_error: '生成UIの表示に失敗した',
  click: 'クリックした',
  widget_event: '生成UI内で操作した',
};

function Follow({ items }: { items: InterventionLog['followUp'] }) {
  const shown = items.filter((f) => f.type !== 'widget_shown');
  if (shown.length === 0) return <span className="muted">（変更後に記録された操作はありません）</span>;
  return (
    <ul>
      {shown.slice(0, 6).map((f, i) => (
        <li key={i}>
          {FOLLOW_LABEL[f.type] ?? f.type}
          {f.actionId ? `（${f.actionId}）` : ''}
        </li>
      ))}
    </ul>
  );
}

export function Reveal() {
  const router = useRouter();
  const all = useDemo((s) => s.interventions);
  const [instruction, setInstruction] = useState('');
  const [showNoop, setShowNoop] = useState(false);
  const items = all.filter((i) => showNoop || i.action !== 'noop');
  return (
    <div className="modal-backdrop" data-ai-ignore>
      <div className="modal reveal" role="dialog" aria-labelledby="reveal-title">
        <div className="reveal-head">
          <h2 id="reveal-title">種明かし：AIは何を見て、何を変えたか</h2>
          <button onClick={() => store.set({ revealOpen: false })} data-testid="reveal-close">
            閉じる
          </button>
        </div>
        <p className="small muted">
          「観測事実」はブラウザが記録した値から機械的に作った文です。AIの仮説は推測であり、利用者が実際に見た・考えたことを示すものではありません。
          表示が購入判断の原因だったかどうかは判定していません。
        </p>
        <label className="small">
          <input type="checkbox" checked={showNoop} onChange={(e) => setShowNoop(e.target.checked)} /> 「変更しない」判断も表示
        </label>
        {items.length === 0 ? <p>まだ AI による変更はありません。</p> : null}
        <ol className="timeline" data-testid="reveal-timeline">
          {items.map((i) => (
            <li key={i.id} className={`tl-item tl-${i.mode}`}>
              <div className="tl-meta">
                {(i.atMs / 1000).toFixed(1)}秒 · {i.mode === 'defend' ? '防御モード' : '体験モード'} · {i.applied === 'failed' ? `適用失敗（${i.failure ?? ''}）` : i.applied === 'not_applicable' ? '変更なし' : '適用'}
              </div>
              <div className="tl-row">
                <b>観測事実</b>
                {i.facts.length ? (
                  <ul>
                    {i.facts.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="muted">（目立った変化なし）</span>
                )}
              </div>
              <div className="tl-row">
                <b>AIの仮説</b>
                {i.hypotheses.length ? (
                  <ul>
                    {i.hypotheses.map((h) => (
                      <li key={h.text}>
                        {h.text}（確度: {h.certainty === 'high' ? '高' : h.certainty === 'medium' ? '中' : '低'}
                        {h.evidenceRefs.length ? `／根拠: ${h.evidenceRefs.join(', ')}` : '／根拠の参照なし'}）
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="muted">（仮説なし）</span>
                )}
                <div className="small">AIの説明: {i.explanation}</div>
              </div>
              <div className="tl-row">
                <b>生成したUI</b>
                {i.action === 'upsert_widget' ? (
                  <div>
                    {slotName(i.slot)}に「{i.tactic}」（{i.widgetId}）
                    {i.sourceTsx ? (
                      <details>
                        <summary className="small">生成コード</summary>
                        <pre className="code">{i.sourceTsx}</pre>
                      </details>
                    ) : null}
                  </div>
                ) : i.action === 'remove_widget' ? (
                  <div>{i.widgetId} を取り除いた</div>
                ) : (
                  <div className="muted">変更しなかった</div>
                )}
              </div>
              <div className="tl-row">
                <b>その後の観測</b>
                <Follow items={i.followUp} />
              </div>
            </li>
          ))}
        </ol>
        <div className="defend-box">
          <h3>安全なUIに変える</h3>
          <p className="small">同じAIをモード切替し、直前の生成UIを「料金・条件が明確で断りやすい」UIに作り替えさせます。課題: {SCENARIO.task}</p>
          <input placeholder="任意の改善指示（例: 保証の価格をもっと目立たせて）" maxLength={200} value={instruction} onChange={(e) => setInstruction(e.target.value)} data-testid="defend-instruction" />
          <button
            className="btn-primary"
            data-testid="switch-defend"
            onClick={() => {
              engine.switchToDefend(instruction);
              router.push(`/products/${SCENARIO.targetProductId}`);
            }}
          >
            安全なUIに変える
          </button>
        </div>
      </div>
    </div>
  );
}

function slotName(slot?: string) {
  return (
    { near_price: '価格の近く', near_shipping: '配送情報の近く', near_purchase: '購入操作の近く', cart_summary: 'カート合計付近', overlay: 'ポップアップ' } as Record<string, string>
  )[slot ?? ''] ?? slot ?? '';
}
