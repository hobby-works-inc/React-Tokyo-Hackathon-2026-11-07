'use client';
// ホスト側のデモ状態（メモリ + 一部 sessionStorage）。生成コードからは直接触れない。
import { useRef, useSyncExternalStore } from 'react';
import type { AllowedSlot } from '../lib/config';
import { calcCart, clampQuantity, getProduct, isKnownOption, type CartLine } from '../lib/scenario';
import type { DecideResponse, ObservationInput, UiDecision } from '../lib/schema';

export type PageId = 'list' | 'product' | 'cart' | 'other';

export type WidgetVersion = { version: number; sourceTsx: string; css: string; js: string; tactic: string; requestId: string };

export type WidgetState = {
  id: string;
  slot: AllowedSlot;
  /** 表示中の正常なバージョン（なければ未表示） */
  active: WidgetVersion | null;
  /** 描画確認待ちの新しいバージョン */
  pending: WidgetVersion | null;
  lastError: string | null;
  repairTried: boolean;
  createdAt: number;
};

export type InterventionLog = {
  id: string;
  atMs: number;
  requestId: string;
  mode: 'challenge' | 'defend';
  action: UiDecision['action'];
  widgetId?: string;
  slot?: AllowedSlot;
  tactic?: string;
  observationSummary: string;
  hypotheses: UiDecision['hypotheses'];
  explanation: string;
  /** 送信した入力から機械的に作った観測事実の文（LLM の文章ではない） */
  facts: string[];
  sourceTsx?: string;
  applied: 'applied' | 'rejected_stale' | 'failed' | 'not_applicable';
  failure?: string;
  followUp: Array<{ atMs: number; type: string; widgetId?: string; actionId?: string; regionId?: string }>;
};

export type DevLogEntry = {
  requestId: string;
  atMs: number;
  trigger: ObservationInput['trigger'];
  input: ObservationInput;
  status: 'pending' | 'ok' | 'error' | 'aborted' | 'stale' | 'applied' | 'render_failed';
  response?: DecideResponse;
  latencyMs?: number;
  note?: string;
};

export type DemoState = {
  epoch: number;
  stateRevision: number;
  uiRevision: number;
  modeRevision: number;
  mode: 'challenge' | 'defend';
  consented: boolean;
  /** 模擬注文が完了した（攻撃UIの生成を停止） */
  orderPlaced: boolean;
  /** 体験を終了した（すべての生成を停止） */
  finished: boolean;
  auth: { displayName: string } | null;
  cart: CartLine[];
  pendingOptions: Record<string, string[]>;
  page: { id: PageId; productId?: string; path: string };
  widgets: WidgetState[];
  interventions: InterventionLog[];
  devLog: DevLogEntry[];
  order: { lines: CartLine[]; totalYen: number; atMs: number } | null;
  server: { mode: 'live' | 'mock'; model: string; liveAvailable: boolean; accessTokenRequired: boolean; reason?: string } | null;
  accessToken: string;
  revealOpen: boolean;
  devPanelOpen: boolean;
  pendingDefend: { instruction?: string } | null;
  dismissedOverlay: boolean;
  lastSkip: string | null;
  inflight: boolean;
};

const initial = (epoch = 0): DemoState => ({
  epoch,
  stateRevision: 0,
  uiRevision: 0,
  modeRevision: 0,
  mode: 'challenge',
  consented: false,
  orderPlaced: false,
  finished: false,
  auth: null,
  cart: [],
  pendingOptions: {},
  page: { id: 'other', path: '/' },
  widgets: [],
  interventions: [],
  devLog: [],
  order: null,
  server: null,
  accessToken: '',
  revealOpen: false,
  devPanelOpen: false,
  pendingDefend: null,
  dismissedOverlay: false,
  lastSkip: null,
  inflight: false,
});

let state: DemoState = initial();
const listeners = new Set<() => void>();
const AUTH_KEY = 'genui-demo-auth';
const CART_KEY = 'genui-demo-cart';

export const store = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  set(patch: Partial<DemoState> | ((s: DemoState) => Partial<DemoState>)) {
    const p = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...p };
    persist();
    listeners.forEach((l) => l());
  },
};

function persist() {
  try {
    // 表示名など最小限のデモ状態のみ。パスワードは保持しない
    if (state.auth) sessionStorage.setItem(AUTH_KEY, JSON.stringify({ displayName: state.auth.displayName }));
    else sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  } catch {
    /* sessionStorage が使えない環境 */
  }
}

export function hydrateFromSession() {
  try {
    const a = sessionStorage.getItem(AUTH_KEY);
    const c = sessionStorage.getItem(CART_KEY);
    const auth = a ? (JSON.parse(a) as { displayName?: unknown }) : null;
    const cart = c ? (JSON.parse(c) as CartLine[]) : [];
    store.set({
      auth: auth && typeof auth.displayName === 'string' ? { displayName: auth.displayName.slice(0, 40) } : null,
      cart: Array.isArray(cart) ? cart.filter((l) => getProduct(l.productId)).map((l) => ({ productId: l.productId, quantity: clampQuantity(l.quantity), optionIds: (l.optionIds ?? []).filter((o) => isKnownOption(l.productId, o)) })) : [],
    });
  } catch {
    /* ignore */
  }
}

const serverState = initial();

/** セレクタが毎回新しい配列を返しても再描画ループにならないよう、浅い比較で前回値を再利用する */
export function useDemo<T>(sel: (s: DemoState) => T): T {
  const cache = useRef<{ v: T } | null>(null);
  const get = (src: DemoState) => {
    const v = sel(src);
    if (cache.current && shallowEqual(cache.current.v, v)) return cache.current.v;
    cache.current = { v };
    return v;
  };
  return useSyncExternalStore(store.subscribe, () => get(state), () => get(serverState));
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  return false;
}

const bumpState = (s: DemoState) => s.stateRevision + 1;

// ---- 状態変更（すべてホストコードが正。金額は calcCart で再計算） ----
export const actions = {
  setPage(page: DemoState['page']) {
    store.set((s) => ({ page, stateRevision: bumpState(s) }));
  },
  login(displayName: string) {
    store.set((s) => ({ auth: { displayName: displayName.slice(0, 40) || 'ゲスト' }, stateRevision: bumpState(s) }));
  },
  logout() {
    store.set((s) => ({ auth: null, stateRevision: bumpState(s) }));
  },
  addToCart(productId: string, quantity: number) {
    const p = getProduct(productId);
    if (!p) return;
    const opts = (state.pendingOptions[productId] ?? []).filter((o) => isKnownOption(productId, o));
    store.set((s) => {
      const existing = s.cart.find((l) => l.productId === productId);
      const cart = existing
        ? s.cart.map((l) => (l.productId === productId ? { ...l, quantity: clampQuantity(l.quantity + quantity), optionIds: opts } : l))
        : [...s.cart, { productId, quantity: clampQuantity(quantity), optionIds: opts }];
      return { cart, stateRevision: bumpState(s) };
    });
  },
  setQuantity(productId: string, quantity: number) {
    store.set((s) => ({ cart: s.cart.map((l) => (l.productId === productId ? { ...l, quantity: clampQuantity(quantity) } : l)), stateRevision: bumpState(s) }));
  },
  removeFromCart(productId: string) {
    store.set((s) => ({ cart: s.cart.filter((l) => l.productId !== productId), stateRevision: bumpState(s) }));
  },
  /** 追加オプションの選択。生成ウィジェットからの要求もここを通り、既知のオプションのみ受け付ける */
  setOption(productId: string, optionId: string, selected: boolean): boolean {
    if (!isKnownOption(productId, optionId)) return false;
    store.set((s) => {
      const cur = s.pendingOptions[productId] ?? [];
      const next = selected ? [...new Set([...cur, optionId])] : cur.filter((o) => o !== optionId);
      const cart = s.cart.map((l) => (l.productId === productId ? { ...l, optionIds: selected ? [...new Set([...l.optionIds, optionId])] : l.optionIds.filter((o) => o !== optionId) } : l));
      return { pendingOptions: { ...s.pendingOptions, [productId]: next }, cart, stateRevision: bumpState(s) };
    });
    return true;
  },
  placeOrder() {
    const s = state;
    if (s.cart.length === 0) return;
    const price = calcCart(s.cart);
    store.set({ order: { lines: s.cart, totalYen: price.totalYen, atMs: performance.now() }, cart: [], orderPlaced: true, stateRevision: bumpState(s) });
  },
  reset() {
    const keep = { server: state.server, accessToken: state.accessToken, devPanelOpen: state.devPanelOpen };
    state = { ...initial(state.epoch + 1), ...keep };
    try {
      sessionStorage.removeItem(CART_KEY);
      sessionStorage.removeItem(AUTH_KEY);
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l());
  },
};

export function optionsSelectedFor(s: DemoState, productId: string): string[] {
  if (s.page.id === 'cart') return s.cart.find((l) => l.productId === productId)?.optionIds ?? [];
  return s.pendingOptions[productId] ?? s.cart.find((l) => l.productId === productId)?.optionIds ?? [];
}
