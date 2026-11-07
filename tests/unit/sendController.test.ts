import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InfoLevel } from '../../src/lib/observe/aggregator';
import { SendController, type DispatchMeta } from '../../src/lib/observe/sendController';

function make(opts: { info?: () => InfoLevel; visible?: () => boolean; blocked?: () => boolean; delay?: number } = {}) {
  const calls: DispatchMeta[] = [];
  const c = new SendController(
    {
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as number),
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (h) => clearInterval(h as number),
      infoLevel: opts.info ?? (() => 'active'),
      isVisible: opts.visible ?? (() => true),
      isBlocked: opts.blocked ?? (() => false),
      dispatch: (m) => {
        calls.push(m);
        return new Promise<void>((resolve) => {
          const t = setTimeout(resolve, opts.delay ?? 100);
          m.signal.addEventListener('abort', () => {
            clearTimeout(t);
            resolve();
          });
        });
      },
    },
    { observationIntervalMs: 5000, majorActionDebounceMs: 250, maxIdleSends: 2, idleSendMinIntervalMs: 15000 },
  );
  return { c, calls };
}

describe('SendController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('主要操作はデバウンスでまとめ、定期送信を待たずに送る', async () => {
    const { c, calls } = make();
    c.start();
    c.notifyMajorAction();
    c.notifyMajorAction();
    c.notifyMajorAction();
    await vi.advanceTimersByTimeAsync(260);
    expect(calls.map((x) => x.trigger)).toEqual(['major_action']);
    c.stop();
  });

  it('タブ非表示中は定期送信しない', async () => {
    const { c, calls } = make({ visible: () => false });
    c.start();
    await vi.advanceTimersByTimeAsync(20000);
    expect(calls).toHaveLength(0);
    expect(c.stats.skippedHidden).toBe(4);
    c.stop();
  });

  it('情報がなければスキップ、無操作の通知は回数と間隔を制限する', async () => {
    let info: InfoLevel = 'none';
    const { c, calls } = make({ info: () => info });
    c.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toHaveLength(0);
    info = 'passive';
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls.filter((x) => x.idleNotice)).toHaveLength(2);
    info = 'active';
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls.at(-1)!.idleNotice).toBe(false);
    c.stop();
  });

  it('同時実行は1件。実行中の定期送信は集約し、主要操作は古いリクエストをキャンセルする', async () => {
    const { c, calls } = make({ delay: 8000 });
    c.start();
    await vi.advanceTimersByTimeAsync(5000); // 1件目（observation_window）
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000); // 実行中 → 集約
    expect(calls).toHaveLength(1);
    c.notifyMajorAction();
    await vi.advanceTimersByTimeAsync(300);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(calls[1]!.trigger).toBe('major_action');
    expect(c.stats.aborted).toBe(1);
    c.stop();
  });

  it('stop で実行中のリクエストもキャンセルし、以後は送らない', async () => {
    const { c, calls } = make({ delay: 8000 });
    c.start();
    c.notifyMajorAction();
    await vi.advanceTimersByTimeAsync(300);
    c.stop();
    expect(calls[0]!.signal.aborted).toBe(true);
    c.notifyMajorAction();
    await vi.advanceTimersByTimeAsync(20000);
    expect(calls).toHaveLength(1);
  });

  it('終了後（blocked）は送らない', async () => {
    const { c, calls } = make({ blocked: () => true });
    c.start();
    c.notifyMajorAction();
    await vi.advanceTimersByTimeAsync(20000);
    expect(calls).toHaveLength(0);
    c.stop();
  });
});
