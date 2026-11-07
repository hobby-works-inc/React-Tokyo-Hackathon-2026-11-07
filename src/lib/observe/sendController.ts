// 送信制御:「主要な操作を優先送信」＋「一定間隔の集計送信」。
// - 主要操作は短いデバウンスでまとめ、定期送信を待たずに送る
// - 定期送信はタブ非表示中は止める。情報がなければスキップ。無操作の通知は回数と間隔を制限
// - 同一セッションの LLM リクエストは1件だけ。実行中の観測は次回へ集約し、
//   主要操作・手動操作が来たら古いリクエストをキャンセルして最新を優先する
import { OBSERVATION_CONFIG } from '../config';
import type { InfoLevel } from './aggregator';

export type Trigger = 'major_action' | 'observation_window' | 'manual';

export type DispatchMeta = { trigger: Trigger; idleNotice: boolean; signal: AbortSignal };

export type SendControllerDeps = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (h: unknown) => void;
  infoLevel: () => InfoLevel;
  isVisible: () => boolean;
  /** 注文完了・体験終了・同意前などで送信を止める */
  isBlocked: () => boolean;
  dispatch: (meta: DispatchMeta) => Promise<void>;
  onSkip?: (reason: string) => void;
};

export type SendControllerConfig = {
  observationIntervalMs: number;
  majorActionDebounceMs: number;
  maxIdleSends: number;
  idleSendMinIntervalMs: number;
};

export class SendController {
  private debounceHandle: unknown = null;
  private intervalHandle: unknown = null;
  private inflight: { controller: AbortController; trigger: Trigger; promise: Promise<void> } | null = null;
  private pendingWindow = false;
  private pendingMajor = false;
  private idleSends = 0;
  private lastIdleSendAt = -Infinity;
  private running = false;
  private readonly cfg: SendControllerConfig;
  /** 開発者パネル表示用 */
  stats = { dispatched: 0, aborted: 0, skippedHidden: 0, skippedNoInfo: 0, skippedIdleLimit: 0 };

  constructor(
    private readonly deps: SendControllerDeps,
    cfg: Partial<SendControllerConfig> = {},
  ) {
    this.cfg = {
      observationIntervalMs: cfg.observationIntervalMs ?? OBSERVATION_CONFIG.observationIntervalMs,
      majorActionDebounceMs: cfg.majorActionDebounceMs ?? OBSERVATION_CONFIG.majorActionDebounceMs,
      maxIdleSends: cfg.maxIdleSends ?? OBSERVATION_CONFIG.maxIdleSends,
      idleSendMinIntervalMs: cfg.idleSendMinIntervalMs ?? OBSERVATION_CONFIG.idleSendMinIntervalMs,
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.intervalHandle = this.deps.setInterval(() => this.onInterval(), this.cfg.observationIntervalMs);
  }

  /** 停止。実行中のリクエストもキャンセルする（終了・リセット後に古い処理を復活させない） */
  stop() {
    this.running = false;
    if (this.intervalHandle !== null) this.deps.clearInterval(this.intervalHandle);
    if (this.debounceHandle !== null) this.deps.clearTimeout(this.debounceHandle);
    this.intervalHandle = null;
    this.debounceHandle = null;
    this.pendingWindow = false;
    this.pendingMajor = false;
    this.abortInflight();
  }

  get isRunning() {
    return this.running;
  }

  get isInflight() {
    return this.inflight !== null;
  }

  /** カート追加・トグル変更・ウィジェットを閉じる等 */
  notifyMajorAction() {
    if (!this.running) return;
    if (this.debounceHandle !== null) this.deps.clearTimeout(this.debounceHandle);
    this.debounceHandle = this.deps.setTimeout(() => {
      this.debounceHandle = null;
      void this.fire('major_action', false);
    }, this.cfg.majorActionDebounceMs);
  }

  /** 種明かし後の「安全なUIに変える」など */
  manual() {
    if (!this.running) return;
    void this.fire('manual', false);
  }

  /** 定期確認（テストから直接呼べるよう public） */
  onInterval() {
    if (!this.running) return;
    if (!this.deps.isVisible()) {
      this.stats.skippedHidden++;
      this.deps.onSkip?.('hidden');
      return;
    }
    if (this.deps.isBlocked()) return;
    const info = this.deps.infoLevel();
    if (info === 'none') {
      this.stats.skippedNoInfo++;
      this.deps.onSkip?.('no_info');
      return;
    }
    if (info === 'passive') {
      const t = this.deps.now();
      if (this.idleSends >= this.cfg.maxIdleSends || t - this.lastIdleSendAt < this.cfg.idleSendMinIntervalMs) {
        this.stats.skippedIdleLimit++;
        this.deps.onSkip?.('idle_limit');
        return;
      }
      if (this.inflight) {
        this.pendingWindow = true;
        return;
      }
      this.idleSends++;
      this.lastIdleSendAt = t;
      void this.fire('observation_window', true);
      return;
    }
    this.idleSends = 0;
    void this.fire('observation_window', false);
  }

  private abortInflight() {
    if (this.inflight) {
      this.inflight.controller.abort();
      this.stats.aborted++;
      this.inflight = null;
    }
  }

  private async fire(trigger: Trigger, idleNotice: boolean): Promise<void> {
    if (!this.running || this.deps.isBlocked()) return;
    if (this.inflight) {
      if (trigger === 'observation_window') {
        // 実行中は観測を集約して、完了後に最新状態をまとめて送る
        this.pendingWindow = true;
        return;
      }
      // 重要な操作：古い判断を無効化してキャンセル
      this.abortInflight();
    }
    if (trigger !== 'observation_window') this.idleSends = 0;
    const controller = new AbortController();
    this.stats.dispatched++;
    const promise = this.deps
      .dispatch({ trigger, idleNotice, signal: controller.signal })
      .catch(() => {})
      .finally(() => {
        if (this.inflight?.controller === controller) {
          this.inflight = null;
          if (this.pendingMajor) {
            this.pendingMajor = false;
            void this.fire('major_action', false);
          } else if (this.pendingWindow) {
            this.pendingWindow = false;
            this.onInterval();
          }
        }
      });
    this.inflight = { controller, trigger, promise };
    return promise;
  }

  /** テスト用: 実行中リクエストの完了待ち */
  async settle() {
    while (this.inflight) await this.inflight.promise;
  }
}
