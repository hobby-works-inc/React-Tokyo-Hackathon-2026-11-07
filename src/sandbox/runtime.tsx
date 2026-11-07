// sandbox="allow-scripts"（allow-same-origin なし）の iframe 内で動く固定ランタイム。
// - ホストから MessageChannel のポートを1回だけ受け取り、以後の通信はそのポートのみ
// - サーバーで検証・トランスパイル済みの JS を評価して React で描画
// - 生成コードの自己申告とは別に、操作を固定の観測コードで計測してホストへ送る
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';

type Ctx = Record<string, unknown>;
type Action = { kind: 'set_option'; optionId: string; selected: boolean } | { kind: 'dismiss' } | { kind: 'event'; name: string };

let port: MessagePort | null = null;
let channel = '';
let current: { widgetId: string; version: number } | null = null;
let root: Root | null = null;
let Component: React.ComponentType<{ context: Ctx; emit: (a: Action) => void }> | null = null;
let context: Ctx = {};

// 生成コードは同じ realm で動くため、評価前に使う組み込み関数を捕まえておく。
// 生成コードがプロトタイプを書き換えても、ホストへの送信経路と操作の判定は変わらない。
const rawPost = MessagePort.prototype.postMessage;
const apply = Reflect.apply;
const perfNow = performance.now.bind(performance);
const uaIsActive: (() => boolean) | null = (() => {
  const ua = (navigator as Navigator & { userActivation?: object }).userActivation;
  const desc = ua ? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ua), 'isActive') : undefined;
  const get = desc?.get;
  return get ? () => !!apply(get, ua, []) : null;
})();
/** 実際のユーザー操作（isTrusted なイベント）の最終時刻 */
let lastTrustedInputAt = -Infinity;
const USER_ACTION_WINDOW_MS = 1000;
const hasRecentUserAction = () => (uaIsActive ? uaIsActive() : false) || perfNow() - lastTrustedInputAt < USER_ACTION_WINDOW_MS;

function post(msg: Record<string, unknown>) {
  if (!port || !current) return;
  apply(rawPost, port, [{ channel, widgetId: current.widgetId, version: current.version, ...msg }]);
}

const SHADOWED = ['window', 'self', 'globalThis', 'document', 'parent', 'top', 'opener', 'location', 'navigator', 'fetch', 'XMLHttpRequest', 'WebSocket', 'Function', 'localStorage', 'sessionStorage', 'indexedDB', 'importScripts'];

// ループ監視: 100ms ごとのタイマーが「メインスレッドに戻った」印。ループ内で 500ms 以上戻っていなければ例外にする
const LOOP_BUDGET_MS = 500;
let lastYieldAt = perfNow();
let loopTripped = false;
setInterval(() => {
  lastYieldAt = perfNow();
}, 100);
let guardCount = 0;
function loopGuard() {
  if (loopTripped) throw new Error('loop limit exceeded');
  if ((++guardCount & 1023) !== 0) return;
  if (perfNow() - lastYieldAt > LOOP_BUDGET_MS) {
    loopTripped = true;
    throw new Error(`loop limit exceeded (${LOOP_BUDGET_MS}ms without yielding)`);
  }
}

function evaluate(js: string) {
  const mod = { exports: {} as Record<string, unknown> };
  const req = (name: string) => {
    if (name === 'react') return React;
    throw new Error(`module "${name}" is not available`);
  };
  // 多層防御: サーバー検証に加えて、危険なグローバルを引数で undefined に上書きする
  // eslint-disable-next-line no-new-func
  const fn = new Function('require', 'exports', 'module', 'React', '__lg', ...SHADOWED, `"use strict";\n${js}`);
  fn(req, mod.exports, mod, React, loopGuard, ...SHADOWED.map(() => undefined));
  const C = (mod.exports.default ?? (mod.exports as { GeneratedWidget?: unknown }).GeneratedWidget) as typeof Component;
  if (typeof C !== 'function') throw new Error('default export is not a component');
  return C;
}

function emit(a: Action) {
  if (!a || typeof a !== 'object') return;
  if (a.kind === 'set_option' && typeof a.optionId === 'string' && typeof a.selected === 'boolean') {
    // 料金が変わる操作は、実際のクリック・入力の直後だけ受け付ける（自動でオンにする生成コードを防ぐ）
    if (!hasRecentUserAction()) {
      post({ type: 'emit', action: { kind: 'event', name: 'blocked_auto_option' } });
      return;
    }
    post({ type: 'emit', action: { kind: 'set_option', optionId: a.optionId.slice(0, 40), selected: a.selected } });
  } else if (a.kind === 'dismiss') {
    post({ type: 'emit', action: { kind: 'dismiss' } });
  } else if (a.kind === 'event' && typeof a.name === 'string') {
    post({ type: 'emit', action: { kind: 'event', name: a.name.slice(0, 32) } });
  }
}

class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: Error) {
    post({ type: 'error', phase: 'render', message: String(err?.message ?? err).slice(0, 400) });
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Reporter({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    post({ type: 'rendered', height: measure() });
  }, []);
  return <>{children}</>;
}

function measure() {
  return Math.ceil(document.documentElement.getBoundingClientRect().height);
}

function render() {
  if (!Component) return;
  const C = Component;
  root ??= createRoot(document.getElementById('root')!);
  root.render(
    <Boundary key={`${current?.widgetId}:${current?.version}`}>
      <Reporter>
        <C context={context} emit={emit} />
      </Reporter>
    </Boundary>,
  );
}

function onPortMessage(ev: MessageEvent) {
  const m = ev.data as { type?: string; channel?: string; widgetId?: string; version?: number; js?: string; css?: string; context?: Ctx };
  if (!m || m.channel !== channel) return;
  if (m.type === 'render' && typeof m.js === 'string' && typeof m.widgetId === 'string' && typeof m.version === 'number') {
    current = { widgetId: m.widgetId, version: m.version };
    context = m.context ?? {};
    const style = document.getElementById('widget-css');
    if (style) style.textContent = typeof m.css === 'string' ? m.css : '';
    try {
      Component = evaluate(m.js);
    } catch (e) {
      post({ type: 'error', phase: 'eval', message: String((e as Error)?.message ?? e).slice(0, 400) });
      return;
    }
    render();
  } else if (m.type === 'context' && current && m.widgetId === current.widgetId && m.version === current.version) {
    context = m.context ?? {};
    render();
  }
}

// init は親 window からの最初の1回だけ受け付ける
function onInit(ev: MessageEvent) {
  if (ev.source !== window.parent || port) return;
  const d = ev.data as { type?: string; channel?: string };
  if (d?.type !== 'init' || typeof d.channel !== 'string' || !ev.ports[0]) return;
  channel = d.channel;
  port = ev.ports[0];
  port.onmessage = onPortMessage;
  window.removeEventListener('message', onInit);
}
window.addEventListener('message', onInit);

window.addEventListener('error', (e) => post({ type: 'error', phase: 'runtime', message: String(e.message).slice(0, 400) }));
window.addEventListener('unhandledrejection', (e) => post({ type: 'error', phase: 'runtime', message: String((e.reason as Error)?.message ?? e.reason).slice(0, 400) }));

// ---- 固定の観測ランタイム ----
let enteredAt = 0;
const pt = (e: PointerEvent): string => (e.pointerType === 'mouse' || e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'unknown');
document.documentElement.addEventListener('pointerenter', (e) => {
  if (!e.isTrusted || e.pointerType === 'touch') return; // タッチではホバーを捏造しない
  enteredAt = perfNow();
  post({ type: 'telemetry', kind: 'pointerenter', pointerType: pt(e) });
});
document.documentElement.addEventListener('pointerleave', (e) => {
  if (!e.isTrusted || e.pointerType === 'touch' || !enteredAt) return;
  post({ type: 'telemetry', kind: 'pointerleave', pointerType: pt(e), dwellMs: Math.round(perfNow() - enteredAt) });
  enteredAt = 0;
});
const actionIdOf = (t: EventTarget | null) => {
  const el = t instanceof Element ? t.closest('[data-action-id]') : null;
  const id = el?.getAttribute('data-action-id') ?? undefined;
  return id && /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : undefined;
};
// isTrusted なイベントだけを計測・操作の根拠にする（生成コードの el.click() や dispatchEvent は数えない）
const markTrusted = (e: Event) => {
  if (e.isTrusted) lastTrustedInputAt = perfNow();
};
for (const t of ['pointerdown', 'pointerup', 'keydown', 'click', 'change', 'input']) document.addEventListener(t, markTrusted, true);
document.addEventListener(
  'click',
  (e) => {
    if (e.isTrusted) post({ type: 'telemetry', kind: 'click', pointerType: pt(e as PointerEvent), actionId: actionIdOf(e.target) });
  },
  true,
);
document.addEventListener(
  'change',
  (e) => {
    if (e.isTrusted) post({ type: 'telemetry', kind: 'change', pointerType: 'unknown', actionId: actionIdOf(e.target) });
  },
  true,
);

new ResizeObserver(() => post({ type: 'resize', height: measure() })).observe(document.documentElement);
