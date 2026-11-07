import { describe, expect, it } from 'vitest';
import { ObservationAggregator } from '../../src/lib/observe/aggregator';

function setup() {
  let t = 0;
  const agg = new ObservationAggregator(() => t, { cursorStationaryAfterMs: 500, contextWindowMs: 30000, maxRecentEvents: 40, scrollStopMs: 400 });
  agg.resetPageView([{ id: 'price', label: '価格' }, { id: 'shipping', label: '配送' }, { id: 'widget:x', label: 'w', occludable: false }]);
  return { agg, advance: (ms: number) => { t += ms; agg.tick(); }, at: () => t };
}

describe('ObservationAggregator', () => {
  it('表示時間と上部帯の時間を差分で集計し、commit でリセットする', () => {
    const { agg, advance } = setup();
    agg.setVisibility('price', 1);
    agg.setUpperBand('price', true);
    advance(1000);
    agg.setUpperBand('price', false);
    advance(500);
    const s1 = agg.commit();
    const p = s1.regions.find((r) => r.id === 'price')!;
    expect(p.visibleMs).toBe(1500);
    expect(p.upperBandExposureMs).toBe(1000);
    advance(200);
    const p2 = agg.commit().regions.find((r) => r.id === 'price')!;
    expect(p2.visibleMs).toBe(200);
    expect(p2.cumulative.visibleMs).toBe(1700);
  });

  it('非表示タブ・フォーカスなしでは表示時間を数えない', () => {
    const { agg, advance } = setup();
    agg.setVisibility('price', 1);
    agg.setPageState({ visible: false });
    advance(5000);
    agg.setPageState({ visible: true, focused: false });
    advance(1000);
    expect(agg.commit().regions.find((r) => r.id === 'price')!.visibleMs).toBe(0);
    expect(agg.unfocusedMs).toBe(1000);
  });

  it('ホスト側モーダルで覆われた領域は数えないが、overlay ウィジェットは数える', () => {
    const { agg, advance } = setup();
    agg.setVisibility('price', 1);
    agg.setVisibility('widget:x', 1);
    agg.setPageState({ hostModalOpen: true });
    advance(1000);
    const s = agg.commit();
    expect(s.regions.find((r) => r.id === 'price')!.visibleMs).toBe(0);
    expect(s.regions.find((r) => r.id === 'widget:x')!.visibleMs).toBe(1000);
  });

  it('カーソル滞在・停止・再訪を数え、動いていないカーソルの下の要素変化は再訪にしない', () => {
    const { agg, advance } = setup();
    agg.pointerMove('price', 'mouse', true);
    advance(1000);
    agg.pointerMove('shipping', 'mouse', true);
    advance(100);
    agg.pointerMove('price', 'mouse', false); // レイアウト変化（カーソルは止まっている）
    advance(100);
    agg.pointerMove('price', 'mouse', true);
    advance(100);
    const s = agg.commit();
    const p = s.regions.find((r) => r.id === 'price')!;
    expect(p.revisitCount).toBe(1);
    expect(p.cursorDwellMs).toBe(1100);
    expect(p.cursorStationaryMs).toBe(500);
  });

  it('タッチではホバー値を null にする', () => {
    const { agg, advance } = setup();
    agg.pointerMove('price', 'touch', true);
    advance(1000);
    const p = agg.commit().regions.find((r) => r.id === 'price')!;
    expect(p.cursorDwellMs).toBeNull();
    expect(p.cursorStationaryMs).toBeNull();
  });

  it('イベントを二重計上しない（isNew は1回だけ true）', () => {
    const { agg, advance } = setup();
    agg.recordEvent({ type: 'click', regionId: 'price', actionId: 'a' });
    const s1 = agg.commit();
    expect(s1.events.filter((e) => e.isNew)).toHaveLength(1);
    expect(s1.regions.find((r) => r.id === 'price')!.clickCount).toBe(1);
    advance(100);
    const s2 = agg.commit();
    expect(s2.events.filter((e) => e.isNew)).toHaveLength(0);
    expect(s2.regions.find((r) => r.id === 'price')!.clickCount).toBe(0);
  });

  it('直近の文脈ウィンドウより古いイベントを捨てる', () => {
    const { agg, advance } = setup();
    agg.recordEvent({ type: 'click' });
    advance(31000);
    agg.recordEvent({ type: 'cart_add' });
    expect(agg.commit().events.map((e) => e.type)).toEqual(['cart_add']);
  });

  it('キャンセル時に restore すると差分とイベントの新規フラグが戻る', () => {
    const { agg, advance } = setup();
    agg.setVisibility('price', 1);
    advance(1000);
    agg.recordEvent({ type: 'cart_add' });
    const s1 = agg.commit();
    agg.restore(s1);
    advance(500);
    const s2 = agg.commit();
    expect(s2.regions.find((r) => r.id === 'price')!.visibleMs).toBe(1500);
    expect(s2.events.filter((e) => e.isNew)).toHaveLength(1);
  });

  it('スクロール方向・反転・停止を集計する', () => {
    const { agg, advance } = setup();
    agg.scroll(100);
    advance(50);
    agg.scroll(300);
    advance(50);
    agg.scroll(250);
    advance(500);
    const s = agg.commit();
    expect(s.scroll).toEqual({ downPx: 300, upPx: 50, reversals: 1, stops: 1 });
  });

  it('情報量: 操作なしで表示だけなら passive、何もなければ none', () => {
    const { agg, advance } = setup();
    agg.commit();
    expect(agg.infoLevel()).toBe('none');
    agg.setVisibility('price', 1);
    advance(100);
    expect(agg.infoLevel()).toBe('passive');
    agg.recordEvent({ type: 'click' });
    expect(agg.infoLevel()).toBe('active');
  });
});
