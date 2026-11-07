'use client';
// 生成ウィジェットを sandbox="allow-scripts" の iframe で動かす。
// allow-same-origin / allow-forms / allow-popups / allow-top-navigation は付けない。
import { useEffect, useRef, useState } from 'react';
import { WIDGET_CONFIG, type AllowedSlot } from '../lib/config';
import { newChannelId, validateWidgetMessage } from '../lib/messages';
import { engine } from './engine';
import { store, type WidgetVersion } from './store';

function srcdoc(origin: string) {
  const runtime = `${origin}/sandbox/runtime.js`;
  const csp = [
    "default-src 'none'",
    `script-src ${runtime} 'unsafe-eval'`,
    "style-src 'unsafe-inline'",
    'img-src data:',
    "font-src 'none'",
    "connect-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">
<style>html,body{margin:0;padding:0;background:transparent;font-family:system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;font-size:14px;color:#111;overflow:hidden}*{box-sizing:border-box}</style>
<style id="widget-css"></style></head><body><div id="root"></div><script src="${runtime}"></script></body></html>`;
}

type Props = {
  widgetId: string;
  slot: AllowedSlot;
  v: WidgetVersion;
  hidden: boolean;
};

export function SandboxFrame({ widgetId, slot, v, hidden }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  const max = WIDGET_CONFIG.slotMaxHeightPx[slot];

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    const channel = newChannelId();
    const mc = new MessageChannel();
    let done = false;
    let lastCtx = '';
    const expected = { channel, widgetId, version: v.version };
    const optionIds = () => engine.widgetContext(slot).options.map((o) => o.id);

    const timeout = window.setTimeout(() => {
      if (!done) {
        done = true;
        engine.onWidgetFailed(widgetId, v.version, `render timeout (${WIDGET_CONFIG.renderTimeoutMs}ms)`);
      }
    }, WIDGET_CONFIG.renderTimeoutMs);

    mc.port1.onmessage = (ev) => {
      const res = validateWidgetMessage(ev.data, expected, optionIds());
      if (!res.ok) {
        // 不正なメッセージは拒否（開発者パネルに残す）
        store.set((s) => ({ lastSkip: `rejected widget message (${res.reason})` }));
        return;
      }
      const m = res.message;
      if (m.type === 'rendered') {
        setHeight(Math.min(max, m.height));
        if (!done) {
          done = true;
          window.clearTimeout(timeout);
          engine.onWidgetRendered(widgetId, v.version);
        }
      } else if (m.type === 'resize') {
        setHeight(Math.min(max, m.height));
      } else if (m.type === 'error') {
        done = true;
        window.clearTimeout(timeout);
        engine.onWidgetFailed(widgetId, v.version, `${m.phase}: ${m.message}`);
      } else if (m.type === 'emit') {
        if (!hiddenRef.current) engine.onWidgetEmit(widgetId, m.action);
      } else if (m.type === 'telemetry') {
        if (!hiddenRef.current) engine.onWidgetTelemetry(widgetId, m.kind, m.pointerType, m.actionId, m.dwellMs);
      }
    };

    const sendContext = () => {
      const ctx = engine.widgetContext(slot);
      const key = JSON.stringify(ctx);
      if (key === lastCtx) return;
      lastCtx = key;
      mc.port1.postMessage({ type: 'context', channel, widgetId, version: v.version, context: ctx });
    };

    const onLoad = () => {
      // 不透明オリジンのため targetOrigin は '*'。渡すのはチャネルIDとポートだけ
      iframe.contentWindow?.postMessage({ type: 'init', channel }, '*', [mc.port2]);
      const ctx = engine.widgetContext(slot);
      lastCtx = JSON.stringify(ctx);
      mc.port1.postMessage({ type: 'render', channel, widgetId, version: v.version, js: v.js, css: v.css, context: ctx });
    };
    iframe.addEventListener('load', onLoad);
    iframe.srcdoc = srcdoc(window.location.origin);
    const unsub = store.subscribe(sendContext);
    return () => {
      unsub();
      window.clearTimeout(timeout);
      iframe.removeEventListener('load', onLoad);
      mc.port1.close();
    };
  }, [widgetId, slot, v, max]);

  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  return (
    <iframe
      ref={ref}
      title={`生成UI ${widgetId}`}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      data-widget-id={widgetId}
      data-widget-version={v.version}
      data-widget-state={hidden ? 'pending' : 'active'}
      style={
        hidden
          ? { position: 'absolute', visibility: 'hidden', pointerEvents: 'none', width: '100%', height: 0, border: 0, left: 0, top: 0 }
          : { width: '100%', height, maxHeight: max, border: 0, display: 'block', overflow: 'hidden' }
      }
    />
  );
}
