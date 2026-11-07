// ブラウザ内の行動集計（純粋ロジック）。DOM との接続は useObservation 側で行う。
// ここで扱うのは「観測事実」だけで、「見ていた」「迷っていた」などの推測ラベルは付けない。
import { OBSERVATION_CONFIG } from '../config';
import type { ObservedEvent, RegionMetrics } from '../schema';

type Cfg = {
  cursorStationaryAfterMs: number;
  contextWindowMs: number;
  maxRecentEvents: number;
  scrollStopMs: number;
};

type RegionAcc = {
  id: string;
  label: string;
  ratio: number;
  inBand: boolean;
  /** overlay や生成ウィジェットはホストモーダルで隠れない */
  occludable: boolean;
  d: { visibleMs: number; band: number; dwell: number; stationary: number; revisit: number; click: number };
  c: { visibleMs: number; dwell: number; revisit: number; click: number; entered: number };
};

export type PointerKind = 'mouse' | 'touch' | 'pen' | 'unknown';

export type AggregateSnapshot = {
  deltaWindow: { fromMs: number; toMs: number };
  regions: RegionMetrics[];
  events: ObservedEvent[];
  scroll: { downPx: number; upPx: number; reversals: number; stops: number };
  /** commit 時の内部値（abort 時に restore するため） */
  _restore: RestoreData;
};

type RestoreData = {
  regions: Record<string, RegionAcc['d']>;
  scroll: { downPx: number; upPx: number; reversals: number; stops: number };
  lastSentSeq: number;
  fromMs: number;
  activity: boolean;
};

export type InfoLevel = 'none' | 'passive' | 'active';

const zeroDelta = (): RegionAcc['d'] => ({ visibleMs: 0, band: 0, dwell: 0, stationary: 0, revisit: 0, click: 0 });

export class ObservationAggregator {
  private regions = new Map<string, RegionAcc>();
  private events: Array<Omit<ObservedEvent, 'isNew'> & { seq: number }> = [];
  private seq = 0;
  private lastSentSeq = 0;
  private lastTick: number;
  private windowFrom: number;

  private page = { visible: true, focused: true, hostModalOpen: false };
  private pointer = { type: 'unknown' as PointerKind, region: null as string | null, inWindow: false, lastMoveAt: 0 };
  private hoverCapable = true;
  private scrollState = { lastY: 0, lastDir: 0, lastAt: 0, stopCounted: true };
  private scrollDelta = { downPx: 0, upPx: 0, reversals: 0, stops: 0 };
  private lastInteractionAt: number;
  private activitySinceFlush = false;
  private lastInputMethod: 'pointer' | 'touch' | 'keyboard' | 'none' = 'none';
  private unfocusedVisibleMs = 0;
  private readonly cfg: Cfg;

  constructor(
    private readonly now: () => number,
    cfg: Partial<Cfg> = {},
  ) {
    this.cfg = {
      cursorStationaryAfterMs: cfg.cursorStationaryAfterMs ?? OBSERVATION_CONFIG.cursorStationaryAfterMs,
      contextWindowMs: cfg.contextWindowMs ?? OBSERVATION_CONFIG.contextWindowMs,
      maxRecentEvents: cfg.maxRecentEvents ?? OBSERVATION_CONFIG.maxRecentEvents,
      scrollStopMs: cfg.scrollStopMs ?? OBSERVATION_CONFIG.scrollStopMs,
    };
    const t = now();
    this.lastTick = t;
    this.windowFrom = t;
    this.lastInteractionAt = t;
  }

  /** ページ遷移時。領域の累積値はページ単位でリセットする（イベント履歴は残す） */
  setRegions(list: Array<{ id: string; label: string; occludable?: boolean }>) {
    this.tick();
    const next = new Map<string, RegionAcc>();
    for (const r of list) {
      const prev = this.regions.get(r.id);
      next.set(
        r.id,
        prev ?? {
          id: r.id,
          label: r.label,
          ratio: 0,
          inBand: false,
          occludable: r.occludable ?? true,
          d: zeroDelta(),
          c: { visibleMs: 0, dwell: 0, revisit: 0, click: 0, entered: 0 },
        },
      );
    }
    this.regions = next;
    if (this.pointer.region && !next.has(this.pointer.region)) this.pointer.region = null;
  }

  resetPageView(list: Array<{ id: string; label: string; occludable?: boolean }>) {
    this.tick();
    this.regions.clear();
    this.pointer.region = null;
    this.setRegions(list);
  }

  addRegion(r: { id: string; label: string; occludable?: boolean }) {
    if (this.regions.has(r.id)) return;
    this.tick();
    this.regions.set(r.id, {
      id: r.id,
      label: r.label,
      ratio: 0,
      inBand: false,
      occludable: r.occludable ?? true,
      d: zeroDelta(),
      c: { visibleMs: 0, dwell: 0, revisit: 0, click: 0, entered: 0 },
    });
  }

  removeRegion(id: string) {
    this.tick();
    this.regions.delete(id);
    if (this.pointer.region === id) this.pointer.region = null;
  }

  setVisibility(regionId: string, ratio: number) {
    this.tick();
    const r = this.regions.get(regionId);
    if (r) r.ratio = Math.max(0, Math.min(1, ratio));
  }

  setUpperBand(regionId: string, inBand: boolean) {
    this.tick();
    const r = this.regions.get(regionId);
    if (r) r.inBand = inBand;
  }

  setPageState(p: Partial<{ visible: boolean; focused: boolean; hostModalOpen: boolean }>) {
    this.tick();
    Object.assign(this.page, p);
  }

  setHoverCapable(capable: boolean) {
    this.hoverCapable = capable;
  }

  /**
   * ポインタ移動。moved=false（カーソルは止まっていて下の要素が変わっただけ）の場合は
   * 能動的な移動・再訪として扱わない。
   */
  pointerMove(regionId: string | null, type: PointerKind, moved: boolean) {
    this.tick();
    const t = this.now();
    this.pointer.type = type;
    if (type === 'touch') {
      // タッチではホバーを捏造しない
      this.pointer.region = null;
      this.pointer.inWindow = false;
      this.lastInputMethod = 'touch';
      return;
    }
    this.pointer.inWindow = true;
    this.lastInputMethod = 'pointer';
    if (!moved) return;
    this.pointer.lastMoveAt = t;
    this.lastInteractionAt = t;
    this.activitySinceFlush = true;
    if (regionId !== this.pointer.region) {
      this.pointer.region = regionId;
      if (regionId) {
        const r = this.regions.get(regionId);
        if (r) {
          if (r.c.entered > 0) {
            r.d.revisit += 1;
            r.c.revisit += 1;
          }
          r.c.entered += 1;
        }
      }
    }
  }

  pointerLeaveWindow() {
    this.tick();
    this.pointer.inWindow = false;
    this.pointer.region = null;
  }

  keyboardUsed() {
    this.lastInputMethod = 'keyboard';
    this.lastInteractionAt = this.now();
    this.activitySinceFlush = true;
  }

  scroll(y: number) {
    this.tick();
    const t = this.now();
    const dy = y - this.scrollState.lastY;
    if (dy === 0) return;
    const dir = Math.sign(dy);
    if (dir > 0) this.scrollDelta.downPx += dy;
    else this.scrollDelta.upPx += -dy;
    if (this.scrollState.lastDir !== 0 && dir !== this.scrollState.lastDir) this.scrollDelta.reversals += 1;
    this.scrollState = { lastY: y, lastDir: dir, lastAt: t, stopCounted: false };
    this.lastInteractionAt = t;
    this.activitySinceFlush = true;
  }

  /** 時刻と対象IDを持つイベント。フォームの値やキーストロークは渡さないこと */
  recordEvent(e: { type: string; regionId?: string; widgetId?: string; actionId?: string; value?: string | number | boolean }) {
    this.tick();
    const t = this.now();
    this.seq += 1;
    const ev = { id: `e${this.seq}`, seq: this.seq, atMs: Math.round(t), ...e };
    this.events.push(ev);
    if (e.type === 'click' && e.regionId) {
      const r = this.regions.get(e.regionId);
      if (r) {
        r.d.click += 1;
        r.c.click += 1;
      }
    }
    this.lastInteractionAt = t;
    this.activitySinceFlush = true;
    this.pruneEvents();
    return ev;
  }

  tick() {
    const t = this.now();
    const dt = Math.max(0, t - this.lastTick);
    this.lastTick = t;
    if (dt === 0) return;
    if (!this.page.visible) return; // 非表示タブでは表示時間を集計しない
    if (!this.page.focused) {
      this.unfocusedVisibleMs += dt;
      return;
    }
    for (const r of this.regions.values()) {
      if (r.ratio <= 0) continue;
      if (this.page.hostModalOpen && r.occludable) continue;
      r.d.visibleMs += dt;
      r.c.visibleMs += dt;
      if (r.inBand) r.d.band += dt;
    }
    const pr = this.pointer.region ? this.regions.get(this.pointer.region) : undefined;
    if (pr && this.pointer.inWindow && this.hoverCapable && this.pointer.type !== 'touch') {
      if (!(this.page.hostModalOpen && pr.occludable)) {
        pr.d.dwell += dt;
        pr.c.dwell += dt;
        const stillFor = t - this.pointer.lastMoveAt;
        if (stillFor >= this.cfg.cursorStationaryAfterMs) {
          pr.d.stationary += Math.min(dt, stillFor - this.cfg.cursorStationaryAfterMs);
        }
      }
    }
    if (!this.scrollState.stopCounted && t - this.scrollState.lastAt >= this.cfg.scrollStopMs) {
      this.scrollState.stopCounted = true;
      this.scrollState.lastDir = 0;
      this.scrollDelta.stops += 1;
    }
  }

  private pruneEvents() {
    const cutoff = this.now() - this.cfg.contextWindowMs;
    this.events = this.events.filter((e) => e.atMs >= cutoff);
    if (this.events.length > this.cfg.maxRecentEvents) this.events = this.events.slice(-this.cfg.maxRecentEvents);
  }

  infoLevel(): InfoLevel {
    this.tick();
    if (this.seq > this.lastSentSeq || this.activitySinceFlush) return 'active';
    for (const r of this.regions.values()) if (r.d.visibleMs > 0) return 'passive';
    return 'none';
  }

  msSinceLastInteraction() {
    return Math.max(0, this.now() - this.lastInteractionAt);
  }

  get pointerType(): PointerKind {
    return this.pointer.type;
  }

  get inputMethod() {
    return this.lastInputMethod;
  }

  get pageState() {
    return { ...this.page };
  }

  /** 差分を取り出してリセットする（送信用） */
  commit(): AggregateSnapshot {
    this.tick();
    this.pruneEvents();
    const t = this.now();
    const usesHover = this.hoverCapable && this.pointer.type !== 'touch';
    const restore: RestoreData = {
      regions: {},
      scroll: { ...this.scrollDelta },
      lastSentSeq: this.lastSentSeq,
      fromMs: this.windowFrom,
      activity: this.activitySinceFlush,
    };
    const regions: RegionMetrics[] = [];
    for (const r of this.regions.values()) {
      restore.regions[r.id] = { ...r.d };
      regions.push({
        id: r.id,
        label: r.label,
        visibleRatio: round2(r.ratio),
        visibleMs: Math.round(r.d.visibleMs),
        upperBandExposureMs: Math.round(r.d.band),
        cursorDwellMs: usesHover ? Math.round(r.d.dwell) : null,
        cursorStationaryMs: usesHover ? Math.round(r.d.stationary) : null,
        revisitCount: r.d.revisit,
        clickCount: r.d.click,
        cumulative: {
          visibleMs: Math.round(r.c.visibleMs),
          cursorDwellMs: usesHover ? Math.round(r.c.dwell) : null,
          revisitCount: r.c.revisit,
          clickCount: r.c.click,
        },
      });
      r.d = zeroDelta();
    }
    const events: ObservedEvent[] = this.events.map(({ seq, ...e }) => ({ ...e, isNew: seq > this.lastSentSeq }));
    const snap: AggregateSnapshot = {
      deltaWindow: { fromMs: Math.round(this.windowFrom), toMs: Math.round(t) },
      regions,
      events,
      scroll: { ...this.scrollDelta },
      _restore: restore,
    };
    this.lastSentSeq = this.seq;
    this.scrollDelta = { downPx: 0, upPx: 0, reversals: 0, stops: 0 };
    this.windowFrom = t;
    this.activitySinceFlush = false;
    return snap;
  }

  /** キャンセルされた送信の差分を戻す（LLM が見ていない値を失わない・二重計上しない） */
  restore(snap: AggregateSnapshot) {
    const d = snap._restore;
    for (const [id, delta] of Object.entries(d.regions)) {
      const r = this.regions.get(id);
      if (!r) continue;
      r.d.visibleMs += delta.visibleMs;
      r.d.band += delta.band;
      r.d.dwell += delta.dwell;
      r.d.stationary += delta.stationary;
      r.d.revisit += delta.revisit;
      r.d.click += delta.click;
    }
    this.scrollDelta.downPx += d.scroll.downPx;
    this.scrollDelta.upPx += d.scroll.upPx;
    this.scrollDelta.reversals += d.scroll.reversals;
    this.scrollDelta.stops += d.scroll.stops;
    this.lastSentSeq = Math.min(this.lastSentSeq, d.lastSentSeq);
    this.windowFrom = Math.min(this.windowFrom, d.fromMs);
    this.activitySinceFlush = this.activitySinceFlush || d.activity;
  }

  get unfocusedMs() {
    return Math.round(this.unfocusedVisibleMs);
  }

  /** 新しいイベントのみ（介入後の反応を記録するため） */
  eventsSince(atMs: number) {
    return this.events.filter((e) => e.atMs > atMs).map(({ seq: _s, ...e }) => e);
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
