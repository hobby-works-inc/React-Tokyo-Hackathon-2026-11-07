'use client';
// 観測 → 集計 → 送信制御 → /decide → リビジョン確認 → ウィジェット適用 のループ。
import { OBSERVATION_CONFIG, PAGE_SLOTS, SLOT_DESCRIPTIONS, WIDGET_CONFIG, type AllowedSlot } from '../lib/config';
import { ObservationAggregator, type AggregateSnapshot, type PointerKind } from '../lib/observe/aggregator';
import { SendController, type DispatchMeta } from '../lib/observe/sendController';
import { canApply, type RequestStamp } from '../lib/revision';
import { SCENARIO, calcCart, getProduct } from '../lib/scenario';
import type { DecideResponse, ObservationInput } from '../lib/schema';
import type { WidgetContext } from '../lib/messages';
import { actions, optionsSelectedFor, store, type DemoState, type InterventionLog, type WidgetState } from './store';

const now = () => performance.now();

let aggregator = new ObservationAggregator(now);
let controller: SendController | null = null;
let latestRequestId: string | null = null;
let reqSeq = 0;
let detachDom: (() => void) | null = null;
let pendingRepair: ObservationInput['repair'] | undefined;
let mockScenario: string | null = null;
const sessionId = randomId('s');

function randomId(prefix: string) {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return prefix + Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

const isBlocked = (s: DemoState = store.get()) => !s.consented || s.finished || !!s.authError || (s.orderPlaced && s.mode === 'challenge');

// ---------------- public API ----------------

export const engine = {
  get aggregator() {
    return aggregator;
  },
  get controller() {
    return controller;
  },
  sessionId,

  start() {
    if (controller?.isRunning) return;
    try {
      mockScenario = new URLSearchParams(location.search).get('mockScenario') ?? sessionStorage.getItem('genui-mock-scenario');
      if (mockScenario) sessionStorage.setItem('genui-mock-scenario', mockScenario);
    } catch {
      /* ignore */
    }
    controller = new SendController({
      now,
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (h) => window.clearTimeout(h as number),
      setInterval: (fn, ms) => window.setInterval(fn, ms),
      clearInterval: (h) => window.clearInterval(h as number),
      infoLevel: () => aggregator.infoLevel(),
      isVisible: () => document.visibilityState === 'visible',
      isBlocked: () => isBlocked(),
      dispatch,
      onSkip: (reason) => store.set({ lastSkip: reason }),
    });
    controller.start();
    detachDom = attachDom();
    rescanRegions(true);
  },

  stop() {
    controller?.stop();
    controller = null;
    detachDom?.();
    detachDom = null;
    latestRequestId = null;
    store.set({ inflight: false });
  },

  reset() {
    engine.stop();
    aggregator = new ObservationAggregator(now);
    pendingRepair = undefined;
    actions.reset();
  },

  /** ベースUIからの操作イベント */
  track(type: string, opts: { regionId?: string; actionId?: string; widgetId?: string; value?: string | number | boolean; major?: boolean } = {}) {
    if (!store.get().consented) return;
    const { major, ...rest } = opts;
    const ev = aggregator.recordEvent({ type, ...rest });
    addFollowUp({ atMs: ev.atMs, type, widgetId: rest.widgetId, actionId: rest.actionId, regionId: rest.regionId });
    if (major) controller?.notifyMajorAction();
  },

  onPageChange() {
    // DOM 反映後に領域を走査（ページ単位で集計をリセット）
    requestAnimationFrame(() => rescanRegions(true));
    const s = store.get();
    if (s.pendingDefend && s.page.id === 'product') {
      window.setTimeout(() => controller?.manual(), 50);
    }
  },

  rescanRegions,

  switchToDefend(instruction?: string) {
    const s = store.get();
    // 切替前（challenge）のリクエストは canApply で mode 不一致として捨てられるが、明示的にもキャンセルする
    engine.stop();
    store.set({ mode: 'defend', modeRevision: s.modeRevision + 1, revealOpen: false, finished: false, pendingDefend: { instruction: instruction?.slice(0, 200) || undefined } });
    engine.start();
    if (store.get().page.id === 'product') window.setTimeout(() => controller?.manual(), 50);
  },

  finish() {
    store.set({ finished: true });
    engine.stop();
  },

  manual() {
    controller?.manual();
  },

  widgetContext(slot: AllowedSlot): WidgetContext {
    return buildWidgetContext(store.get(), slot);
  },

  /** 生成ウィジェットの描画結果（SandboxFrame から） */
  onWidgetRendered(widgetId: string, version: number) {
    const s = store.get();
    const w = s.widgets.find((x) => x.id === widgetId);
    if (!w || w.pending?.version !== version) return;
    store.set({
      widgets: s.widgets.map((x) => (x.id === widgetId ? { ...x, active: x.pending, pending: null, lastError: null } : x)),
      uiRevision: s.uiRevision + 1,
    });
    aggregator.recordEvent({ type: 'widget_shown', widgetId });
  },

  onWidgetFailed(widgetId: string, version: number, error: string) {
    const s = store.get();
    const w = s.widgets.find((x) => x.id === widgetId);
    if (!w) return;
    const isPending = w.pending?.version === version;
    const isActive = w.active?.version === version;
    if (!isPending && !isActive) return;
    const failedSource = (isPending ? w.pending : w.active)!.sourceTsx;
    // 直前の正常なUIを維持する（pending を捨てる。active 自体が壊れたら取り除く）
    const widgets = s.widgets
      .map((x) => (x.id === widgetId ? { ...x, pending: isPending ? null : x.pending, active: isActive ? null : x.active, lastError: error } : x))
      .filter((x) => x.active || x.pending);
    store.set({
      widgets,
      uiRevision: s.uiRevision + 1,
      interventions: s.interventions.map((i) => (i.widgetId === widgetId && i.applied === 'applied' && i === lastInterventionFor(s, widgetId) ? { ...i, applied: 'failed' as const, failure: error } : i)),
    });
    markDevLog(w.pending?.requestId ?? w.active?.requestId ?? '', 'render_failed', error);
    aggregator.recordEvent({ type: 'widget_error', widgetId });
    if (!w.repairTried && WIDGET_CONFIG.maxRepairAttempts > 0) {
      store.set((st) => ({ widgets: st.widgets.map((x) => (x.id === widgetId ? { ...x, repairTried: true } : x)) }));
      pendingRepair = { widgetId, error: error.slice(0, 500), sourceTsx: failedSource.slice(0, WIDGET_CONFIG.maxSourceChars) };
      controller?.notifyMajorAction();
    }
  },

  /** ウィジェットからの emit（検証済み） */
  onWidgetEmit(widgetId: string, action: { kind: 'set_option'; optionId: string; selected: boolean } | { kind: 'dismiss' } | { kind: 'event'; name: string }) {
    const s = store.get();
    const w = s.widgets.find((x) => x.id === widgetId);
    if (!w) return;
    if (action.kind === 'dismiss') {
      engine.dismissWidget(widgetId);
      return;
    }
    if (action.kind === 'set_option') {
      const productId = contextProductId(s);
      if (!productId) return;
      // ホスト側で値と対象IDを再検証し、料金を再計算する
      if (!actions.setOption(productId, action.optionId, action.selected)) return;
      engine.track('widget_option_change', { widgetId, actionId: action.optionId, value: action.selected, major: true });
      return;
    }
    engine.track('widget_event', { widgetId, actionId: action.name });
  },

  /** ホスト側の閉じる操作（overlay の×ボタン等）と、ウィジェットの dismiss */
  dismissWidget(widgetId: string) {
    const s = store.get();
    if (!s.widgets.some((w) => w.id === widgetId)) return;
    store.set({ widgets: s.widgets.filter((w) => w.id !== widgetId), uiRevision: s.uiRevision + 1 });
    aggregator.removeRegion(`widget:${widgetId}`);
    engine.track('widget_dismiss', { widgetId, major: true });
  },

  onWidgetTelemetry(widgetId: string, kind: string, pointerType: PointerKind, actionId?: string, dwellMs?: number) {
    const regionId = `widget:${widgetId}`;
    if (kind === 'click') engine.track('click', { regionId, widgetId, actionId });
    else if (kind === 'change') engine.track('widget_input_change', { widgetId, actionId });
    else if (kind === 'pointerenter') aggregator.pointerMove(regionId, pointerType, true);
    else if (kind === 'pointerleave') {
      aggregator.pointerMove(null, pointerType, true);
      if (dwellMs && dwellMs > 300) aggregator.recordEvent({ type: 'widget_hover', widgetId, value: Math.round(dwellMs) });
    }
  },

  setHostModal(open: boolean) {
    aggregator.setPageState({ hostModalOpen: open });
  },

  mockScenarioHeader: () => mockScenario,
};

// ---------------- DOM の観測 ----------------

let io: IntersectionObserver | null = null;
let bandIo: IntersectionObserver | null = null;
let observed = new Map<Element, string>();

function regionElements(): Array<{ el: Element; id: string; label: string; occludable: boolean }> {
  return Array.from(document.querySelectorAll('[data-ai-region]'))
    .filter((el) => !el.closest('[data-ai-ignore]'))
    .map((el) => ({
      el,
      id: el.getAttribute('data-ai-region')!,
      label: el.getAttribute('data-ai-label') ?? el.getAttribute('data-ai-region')!,
      occludable: el.getAttribute('data-ai-occludable') !== 'false',
    }));
}

function rescanRegions(resetPage = false) {
  if (!io || !bandIo) return;
  const list = regionElements();
  if (resetPage) aggregator.resetPageView(list);
  else for (const r of list) aggregator.addRegion(r);
  const ids = new Set(list.map((r) => r.id));
  for (const [el, id] of observed) {
    if (!el.isConnected) {
      io.unobserve(el);
      bandIo.unobserve(el);
      observed.delete(el);
      if (!ids.has(id)) aggregator.removeRegion(id);
    }
  }
  for (const r of list) {
    if (!observed.has(r.el)) {
      observed.set(r.el, r.id);
      io.observe(r.el);
      bandIo.observe(r.el);
    }
  }
}

function attachDom(): () => void {
  const band = OBSERVATION_CONFIG.upperBand;
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const id = observed.get(e.target);
        if (id) aggregator.setVisibility(id, e.isIntersecting ? e.intersectionRatio : 0);
      }
    },
    { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
  );
  // 画面上部の帯（初期案: ビューポート高さの 10〜40%）を rootMargin で表現
  bandIo = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const id = observed.get(e.target);
        if (id) aggregator.setUpperBand(id, e.isIntersecting);
      }
    },
    { rootMargin: `-${band.top * 100}% 0px -${(1 - band.bottom) * 100}% 0px`, threshold: 0 },
  );
  observed = new Map();

  const hoverCapable = window.matchMedia?.('(hover: hover)').matches ?? true;
  aggregator.setHoverCapable(hoverCapable);

  let lastSample = 0;
  let lastX = -1;
  let lastY = -1;
  const onPointerMove = (e: PointerEvent) => {
    const t = now();
    if (t - lastSample < OBSERVATION_CONFIG.pointerSampleMs) return; // 間引き
    lastSample = t;
    const moved = e.clientX !== lastX || e.clientY !== lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('[data-ai-ignore]')) {
      aggregator.pointerMove(null, kind(e.pointerType), false);
      return;
    }
    const region = target?.closest('[data-ai-region]')?.getAttribute('data-ai-region') ?? null;
    aggregator.pointerMove(region, kind(e.pointerType), moved);
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') aggregator.pointerMove(null, 'touch', true);
  };
  const onLeave = (e: MouseEvent) => {
    if (!e.relatedTarget) aggregator.pointerLeaveWindow();
  };
  const onClick = (e: MouseEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target || target.closest('[data-ai-ignore]')) return; // 開発者パネル等は集計しない
    const regionId = target.closest('[data-ai-region]')?.getAttribute('data-ai-region') ?? undefined;
    const actionId = target.closest('[data-action-id]')?.getAttribute('data-action-id') ?? undefined;
    if (!regionId && !actionId) return;
    engine.track('click', { regionId, actionId });
  };
  const onScroll = () => aggregator.scroll(window.scrollY);
  const onVisibility = () => aggregator.setPageState({ visible: document.visibilityState === 'visible' });
  const onFocus = () => aggregator.setPageState({ focused: true });
  const onBlur = () => aggregator.setPageState({ focused: document.hasFocus() });
  const onKey = (e: KeyboardEvent) => {
    // キーストロークの内容は記録しない（入力方式だけ）
    if (!(e.target instanceof Element && e.target.closest('[data-ai-ignore]'))) aggregator.keyboardUsed();
  };
  const tick = window.setInterval(() => aggregator.tick(), OBSERVATION_CONFIG.tickMs);
  const mo = new MutationObserver(() => rescanRegions(false));
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ai-region'] });

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  document.addEventListener('mouseout', onLeave);
  document.addEventListener('click', onClick, true);
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onFocus);
  window.addEventListener('blur', onBlur);
  window.addEventListener('keydown', onKey, true);
  aggregator.setPageState({ visible: document.visibilityState === 'visible', focused: document.hasFocus() });
  aggregator.scroll(window.scrollY);

  return () => {
    window.clearInterval(tick);
    mo.disconnect();
    io?.disconnect();
    bandIo?.disconnect();
    io = null;
    bandIo = null;
    observed.clear();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('mouseout', onLeave);
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('keydown', onKey, true);
  };
}

const kind = (t: string): PointerKind => (t === 'mouse' || t === 'touch' || t === 'pen' ? t : 'unknown');

// ---------------- 入力の組み立て ----------------

function contextProductId(s: DemoState): string | null {
  if (s.page.id === 'product' && s.page.productId) return s.page.productId;
  if (s.page.id === 'cart') return s.cart.find((l) => l.productId === SCENARIO.targetProductId)?.productId ?? s.cart[0]?.productId ?? null;
  return SCENARIO.targetProductId;
}

export function buildWidgetContext(s: DemoState, slot: AllowedSlot): WidgetContext {
  const pid = contextProductId(s);
  const p = pid ? getProduct(pid) : undefined;
  const selected = p ? optionsSelectedFor(s, p.id) : [];
  const price = calcCart(s.cart);
  return {
    slot,
    mode: s.mode,
    product: p ? { id: p.id, name: p.name, priceYen: p.priceYen, shippingYen: p.shippingYen, shippingNote: p.shippingNote } : null,
    options: p ? p.options.map((o) => ({ id: o.id, label: o.label, priceYen: o.priceYen, description: o.description, selected: selected.includes(o.id) })) : [],
    cart: { totalYen: price.totalYen, itemCount: price.lines.reduce((n, l) => n + l.quantity, 0), shippingYen: price.shippingYen },
    budgetYen: SCENARIO.budgetYen,
  };
}

function pageSummary(s: DemoState): string {
  if (s.page.id === 'product') return `商品詳細ページ: ${getProduct(s.page.productId ?? '')?.name ?? ''}。画像・価格・説明・レビュー・配送・購入欄がある。`;
  if (s.page.id === 'cart') return `カートページ: ${s.cart.length}件。数量変更・削除・追加オプション・合計・模擬購入がある。`;
  if (s.page.id === 'list') return '商品一覧ページ。';
  return 'その他のページ。';
}

function buildInput(s: DemoState, snap: AggregateSnapshot, meta: DispatchMeta, requestId: string): ObservationInput {
  const target = getProduct(SCENARIO.targetProductId)!;
  const price = calcCart(s.cart);
  const slots = PAGE_SLOTS[s.page.id] ?? [];
  const max = OBSERVATION_CONFIG.maxCodeCharsInSnapshot;
  const instruction = s.pendingDefend?.instruction;
  return {
    sessionId,
    requestId,
    pageId: s.page.id,
    mode: s.mode,
    stateRevision: s.stateRevision,
    uiRevision: s.uiRevision,
    modeRevision: s.modeRevision,
    trigger: meta.trigger,
    metricScopes: { regions: 'deltaWindow', regionsCumulative: 'sincePageView', recentEvents: 'contextWindow' },
    deltaWindow: snap.deltaWindow,
    contextWindowMs: OBSERVATION_CONFIG.contextWindowMs,
    pageState: {
      visible: document.visibilityState === 'visible',
      focused: document.hasFocus(),
      pointerType: aggregator.pointerType,
      lastInputMethod: aggregator.inputMethod,
      scrollY: Math.round(window.scrollY),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      msSinceLastInteraction: Math.round(aggregator.msSinceLastInteraction()),
      hostModalOpen: aggregator.pageState.hostModalOpen,
      scroll: { downPx: Math.round(snap.scroll.downPx), upPx: Math.round(snap.scroll.upPx), reversals: snap.scroll.reversals, stops: snap.scroll.stops },
      idleNotice: meta.idleNotice,
    },
    regions: snap.regions.slice(0, 30),
    recentEvents: snap.events.slice(-OBSERVATION_CONFIG.maxRecentEvents),
    scenario: {
      task: SCENARIO.task,
      budgetYen: SCENARIO.budgetYen,
      product: {
        id: target.id,
        name: target.name,
        priceYen: target.priceYen,
        shippingYen: target.shippingYen,
        shippingNote: target.shippingNote,
        options: target.options.map((o) => ({ id: o.id, label: o.label, priceYen: o.priceYen, description: o.description })),
      },
      cart: {
        lines: price.lines.map((l) => ({ productId: l.productId, name: l.name, quantity: l.quantity, optionIds: l.options.map((o) => o.id), lineTotalYen: l.lineTotalYen })),
        totalYen: price.totalYen,
        shippingYen: price.shippingYen,
      },
      pendingOptionIds: s.pendingOptions[SCENARIO.targetProductId] ?? [],
    },
    currentUI: {
      pageSummary: pageSummary(s),
      availableSlots: slots.map((slot) => ({ slot, description: SLOT_DESCRIPTIONS[slot] })),
      regionDescriptions: snap.regions.map((r) => ({ id: r.id, label: r.label })),
      widgets: s.widgets
        .filter((w) => w.active || w.pending)
        .slice(0, WIDGET_CONFIG.maxActiveWidgets)
        .map((w) => {
          const v = (w.active ?? w.pending)!;
          return { id: w.id, slot: w.slot, version: v.version, tactic: v.tactic.slice(0, 200), mountedOnPage: slots.includes(w.slot), sourceTsx: v.sourceTsx.slice(0, max), sourceTruncated: v.sourceTsx.length > max };
        }),
      maxActiveWidgets: WIDGET_CONFIG.maxActiveWidgets,
    },
    recentInterventions: s.interventions
      .filter((i) => i.action !== 'noop')
      .slice(-OBSERVATION_CONFIG.maxInterventions)
      .map((i) => ({
        id: i.id,
        atMs: Math.round(i.atMs),
        mode: i.mode,
        action: i.action,
        widgetId: i.widgetId,
        slot: i.slot,
        tactic: i.tactic?.slice(0, 200),
        explanation: i.explanation.slice(0, 400),
        applied: i.applied,
        followUp: i.followUp.slice(-12),
      })),
    userInstruction: s.mode === 'defend' ? instruction : undefined,
    repair: pendingRepair,
  };
}

/** 入力から機械的に観測事実の文を作る（種明かし表示用。推測は含めない） */
export function factsFromInput(input: ObservationInput): string[] {
  const facts: string[] = [];
  const sec = (ms: number) => (ms / 1000).toFixed(1);
  for (const r of input.regions) {
    if (r.cursorDwellMs && r.cursorDwellMs >= 800) facts.push(`${r.label}エリアの上にカーソルが${sec(r.cursorDwellMs)}秒あった（前回送信から）`);
    if (r.revisitCount > 0) facts.push(`${r.label}エリアへカーソルが${r.revisitCount}回戻った`);
    if (r.upperBandExposureMs >= 2000) facts.push(`${r.label}エリアが画面上部の帯に${sec(r.upperBandExposureMs)}秒表示されていた`);
  }
  const labels: Record<string, string> = {
    cart_add: 'カートに追加した',
    widget_dismiss: '生成UIを閉じた',
    widget_option_change: '生成UIで追加オプションを変更した',
    option_toggle: '購入欄で追加オプションを変更した',
    quantity_change: '数量を変更した',
    cart_remove: 'カートから削除した',
    widget_hover: '生成UIの上にカーソルを置いた',
  };
  for (const e of input.recentEvents.filter((x) => x.isNew)) {
    const l = labels[e.type];
    if (l) facts.push(`${l}${e.widgetId ? `（${e.widgetId}）` : ''}`);
  }
  if (input.pageState.scroll.reversals > 0) facts.push(`スクロール方向が${input.pageState.scroll.reversals}回反転した`);
  if (input.pageState.idleNotice) facts.push(`最後の操作から${sec(input.pageState.msSinceLastInteraction)}秒操作がなかった（離席などの可能性もある）`);
  if (input.trigger === 'manual') facts.push('「安全なUIに変える」が押された');
  return facts.slice(0, 6);
}

// ---------------- 送信と適用 ----------------

async function dispatch(meta: DispatchMeta): Promise<void> {
  const s = store.get();
  if (isBlocked(s)) return;
  const requestId = `r${++reqSeq}-${randomId('')}`;
  const snap = aggregator.commit();
  const input = buildInput(s, snap, meta, requestId);
  const stamp: RequestStamp = { requestId, epoch: s.epoch, stateRevision: s.stateRevision, uiRevision: s.uiRevision, modeRevision: s.modeRevision, mode: s.mode };
  const usedRepair = pendingRepair;
  pendingRepair = undefined;
  latestRequestId = requestId;
  pushDevLog({ requestId, atMs: now(), trigger: meta.trigger, input, status: 'pending' });
  store.set({ inflight: true });

  let res: DecideResponse;
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (s.accessToken) headers['x-demo-access-token'] = s.accessToken;
    if (mockScenario) headers['x-mock-scenario'] = mockScenario;
    const r = await fetch('/decide', { method: 'POST', headers, body: JSON.stringify(input), signal: meta.signal });
    res = (await r.json()) as DecideResponse;
    if (r.status === 401) {
      // 合言葉が違う・未入力。送信を止めて画面で知らせる（401 を送り続けない）
      store.set({ authError: 'AI を使うには主催者から共有された合言葉が必要です（未入力か、違っています）。' });
    } else if (r.status === 429) {
      store.set({ llmNotice: 'AI の呼び出し回数の上限に達しました。少し待つと再開します。' });
    } else if (!r.ok) {
      store.set({ llmNotice: `AI の判断に失敗しました（${r.status}）。通常の買い物はそのまま続けられます。` });
    } else {
      store.set({ llmNotice: null });
    }
  } catch (e) {
    if (meta.signal.aborted) {
      // キャンセルされた差分は LLM が見ていないので戻す
      aggregator.restore(snap);
      if (usedRepair && !pendingRepair) pendingRepair = usedRepair;
      markDevLog(requestId, 'aborted', 'superseded by newer input');
    } else {
      markDevLog(requestId, 'error', String((e as Error).message));
    }
    if (latestRequestId === requestId) store.set({ inflight: false });
    return;
  } finally {
    if (latestRequestId === requestId) store.set({ inflight: false });
  }

  updateDevLog(requestId, { response: res, latencyMs: res.latencyMs, status: res.ok ? 'ok' : 'error', note: res.ok ? undefined : res.error });
  if (!res.ok || meta.signal.aborted) return;

  const cur = store.get();
  const check = canApply(stamp, { epoch: cur.epoch, stateRevision: cur.stateRevision, uiRevision: cur.uiRevision, modeRevision: cur.modeRevision, mode: cur.mode, ended: isBlocked(cur), latestRequestId }, res.decision);
  if (!check.ok) {
    markDevLog(requestId, 'stale', `not applied: ${check.reason}`);
    if (check.reason === 'state' || check.reason === 'ui') controller?.notifyMajorAction();
    return;
  }
  applyDecision(res, input, cur);
  markDevLog(requestId, 'applied');
  if (cur.pendingDefend) store.set({ pendingDefend: null });
}

function applyDecision(res: Extract<DecideResponse, { ok: true }>, input: ObservationInput, s: DemoState) {
  const d = res.decision;
  const log: InterventionLog = {
    id: `i${s.interventions.length + 1}`,
    atMs: now(),
    requestId: res.requestId,
    mode: s.mode,
    action: d.action,
    observationSummary: d.observationSummary,
    hypotheses: d.hypotheses,
    explanation: d.explanation,
    facts: factsFromInput(input),
    applied: 'applied',
    followUp: [],
  };
  if (d.action === 'noop') {
    store.set({ interventions: [...s.interventions, { ...log, applied: 'not_applicable' as const }].slice(-50) });
    return;
  }
  if (d.action === 'remove_widget') {
    store.set({ widgets: s.widgets.filter((w) => w.id !== d.widgetId), uiRevision: s.uiRevision + 1, interventions: [...s.interventions, { ...log, widgetId: d.widgetId }].slice(-50) });
    aggregator.removeRegion(`widget:${d.widgetId}`);
    return;
  }
  if (!res.compiled) return;
  const existing = s.widgets.find((w) => w.id === d.widget.id);
  const version = ((existing?.pending ?? existing?.active)?.version ?? 0) + 1;
  const v = { version, sourceTsx: d.widget.sourceTsx, css: res.compiled.css, js: res.compiled.js, tactic: d.tactic, requestId: res.requestId };
  const widgets: WidgetState[] = existing
    ? s.widgets.map((w) => (w.id === d.widget.id ? { ...w, slot: d.widget.slot, pending: v, repairTried: input.repair ? true : w.repairTried } : w))
    : [...s.widgets, { id: d.widget.id, slot: d.widget.slot, active: null, pending: v, lastError: null, repairTried: !!input.repair, createdAt: now() }];
  if (widgets.length > WIDGET_CONFIG.maxActiveWidgets) {
    markDevLog(res.requestId, 'stale', 'max widgets reached');
    return;
  }
  store.set({
    widgets,
    dismissedOverlay: d.widget.slot === 'overlay' ? false : s.dismissedOverlay,
    interventions: [...s.interventions, { ...log, widgetId: d.widget.id, slot: d.widget.slot, tactic: d.tactic, sourceTsx: d.widget.sourceTsx }].slice(-50),
  });
}

function lastInterventionFor(s: DemoState, widgetId: string) {
  return [...s.interventions].reverse().find((i) => i.widgetId === widgetId);
}

function addFollowUp(e: InterventionLog['followUp'][number]) {
  const s = store.get();
  const last = [...s.interventions].reverse().find((i) => i.action !== 'noop');
  if (!last || last.followUp.length >= 12) return;
  if (['click'].includes(e.type) && !e.actionId && !e.widgetId) return;
  store.set({ interventions: s.interventions.map((i) => (i === last ? { ...i, followUp: [...i.followUp, { ...e, atMs: Math.round(e.atMs) }] } : i)) });
}

function pushDevLog(e: DemoState['devLog'][number]) {
  store.set((s) => ({ devLog: [...s.devLog, e].slice(-30) }));
}
function updateDevLog(id: string, patch: Partial<DemoState['devLog'][number]>) {
  store.set((s) => ({ devLog: s.devLog.map((e) => (e.requestId === id ? { ...e, ...patch } : e)) }));
}
function markDevLog(id: string, status: DemoState['devLog'][number]['status'], note?: string) {
  updateDevLog(id, { status, ...(note ? { note } : {}) });
}
