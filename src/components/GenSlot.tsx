'use client';
import type { AllowedSlot } from '../lib/config';
import { engine } from './engine';
import { SandboxFrame } from './SandboxFrame';
import { useDemo } from './store';

/** 通常画面に設けた生成UIの差し込み先。ベースの商品情報や購入処理はここに含めない */
export function GenSlot({ slot }: { slot: Exclude<AllowedSlot, 'overlay'> }) {
  const widgets = useDemo((s) => s.widgets.filter((w) => w.slot === slot));
  const live = useDemo((s) => s.server?.mode);
  return (
    <div className="gen-slot" data-slot={slot}>
      {widgets.map((w) => (
        <div key={w.id} className="gen-widget" data-ai-region={`widget:${w.id}`} data-ai-label={`生成UI(${w.id})`} style={{ position: 'relative' }}>
          {w.active ? <span className="gen-tag">AI生成UI{live === 'mock' ? '・mock' : ''}</span> : null}
          {w.active ? (
            // 生成コードの中身にかかわらず、ホスト側の閉じる操作を常に用意する
            <button className="gen-close" data-action-id={`host-close-${w.id}`} aria-label="この生成UIを閉じる" onClick={() => engine.dismissWidget(w.id)}>
              ×
            </button>
          ) : null}
          {[w.active, w.pending].filter(Boolean).map((v) => (
            <SandboxFrame key={v!.version} widgetId={w.id} slot={slot} v={v!} hidden={v !== w.active} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** ホストが管理するポップアップ領域。外枠と閉じる操作はホスト側にあり、生成コードからは消せない */
export function OverlaySlot() {
  const w = useDemo((s) => s.widgets.find((x) => x.slot === 'overlay'));
  const reveal = useDemo((s) => s.revealOpen);
  if (!w) return null;
  const show = !!w.active && !reveal;
  return (
    <div className={show ? 'overlay-backdrop' : 'overlay-hidden'} data-overlay-open={show ? 'true' : 'false'}>
      <div className="overlay-box" data-ai-region={`widget:${w.id}`} data-ai-label={`生成UI(${w.id})`} data-ai-occludable="false" style={{ position: 'relative' }}>
        <button className="overlay-close" data-action-id="overlay-close" onClick={() => engine.dismissWidget(w.id)} aria-label="閉じる">
          × 閉じる
        </button>
        <span className="gen-tag">AI生成UI</span>
        {[w.active, w.pending].filter(Boolean).map((v) => (
          <SandboxFrame key={v!.version} widgetId={w.id} slot="overlay" v={v!} hidden={v !== w.active} />
        ))}
      </div>
    </div>
  );
}
