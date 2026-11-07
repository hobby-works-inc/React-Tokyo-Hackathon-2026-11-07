import { describe, expect, it } from 'vitest';
import { FAMILY_KEYS, OPTION_FAMILY_KEYS, familyOf, generateChallenge } from '../../src/lib/server/mockGen';
import { mockDecide } from '../../src/lib/server/mock';
import { validateOutput } from '../../src/lib/server/decide';
import type { ObservationInput } from '../../src/lib/schema';
import { makeInput } from './fixtures';

const productSlots = [
  { slot: 'near_price' as const, description: '' },
  { slot: 'near_shipping' as const, description: '' },
  { slot: 'near_purchase' as const, description: '' },
  { slot: 'overlay' as const, description: '' },
];

function region(id: string, dwell: number, clicks = 0) {
  return { id, label: id, visibleRatio: 1, visibleMs: 5000, upperBandExposureMs: 0, cursorDwellMs: dwell, cursorStationaryMs: 0, revisitCount: 0, clickCount: clicks, cumulative: { visibleMs: 5000, cursorDwellMs: dwell, revisitCount: 0, clickCount: clicks } };
}

/** いろいろな観測パターン */
function variants(): ObservationInput[] {
  const b = makeInput({ currentUI: { ...makeInput().currentUI, availableSlots: productSlots } });
  const out: ObservationInput[] = [];
  const regs = ['price', 'shipping', 'purchase', 'reviews', 'description'];
  let n = 0;
  for (const rid of regs) {
    for (const extra of ['none', 'idle', 'scroll', 'cart_add', 'dismiss', 'decline'] as const) {
      n++;
      const events: ObservationInput['recentEvents'] = [];
      if (extra === 'cart_add') events.push({ id: `e${n}`, atMs: 1, type: 'cart_add', isNew: true });
      if (extra === 'dismiss') events.push({ id: `e${n}`, atMs: 1, type: 'widget_dismiss', widgetId: 'countdown-abc', isNew: true });
      if (extra === 'decline') events.push({ id: `e${n}`, atMs: 1, type: 'widget_option_change', value: false, isNew: true });
      out.push({
        ...b,
        requestId: `r${n}`,
        regions: [region(rid, 2500, rid === 'purchase' ? 1 : 0)],
        recentEvents: events,
        pageState: { ...b.pageState, msSinceLastInteraction: extra === 'idle' ? 12000 : 200, scroll: { downPx: 0, upPx: extra === 'scroll' ? 800 : 0, reversals: extra === 'scroll' ? 3 : 0, stops: 0 } },
      });
    }
  }
  // カートページ
  for (let i = 0; i < 10; i++) {
    out.push(
      makeInput({
        requestId: `c${i}`,
        pageId: 'cart',
        regions: [region('cart_summary', 2000)],
        currentUI: { ...makeInput().currentUI, availableSlots: [{ slot: 'cart_summary', description: '' }, { slot: 'overlay', description: '' }] },
        scenario: { ...makeInput().scenario, cart: { lines: [{ productId: 'aurora-nc700', name: 'A', quantity: 1, optionIds: i % 2 ? ['warranty'] : [], lineTotalYen: 49800 }], totalYen: 49800, shippingYen: 0 } },
      }),
    );
  }
  return out;
}

describe('mock の生成（default）', () => {
  it('どの観測パターンでも、出力は live と同じ検証（スキーマ・スロット・TSX 検査）を通る', () => {
    let upserts = 0;
    for (const input of variants()) {
      const d = mockDecide({ input, scenario: 'default' });
      const r = validateOutput(JSON.stringify(d), input);
      expect(r.ok, `${input.requestId}: ${!r.ok ? r.error : ''}\n${d.action === 'upsert_widget' ? d.widget.sourceTsx : ''}`).toBe(true);
      if (d.action === 'upsert_widget') upserts++;
    }
    expect(upserts).toBeGreaterThan(30);
  });

  it('全部の手口が、乱数の種を変えると検証を通る', () => {
    const seen = new Set<string>();
    for (const input of variants()) {
      for (let k = 0; k < 8; k++) {
        const d = generateChallenge(input, `k${k}`);
        if (d.action !== 'upsert_widget') continue;
        seen.add(familyOf(d.widget.id));
        const r = validateOutput(JSON.stringify(d), input);
        expect(r.ok, `${d.widget.id}: ${!r.ok ? r.error : ''}`).toBe(true);
      }
    }
    expect([...seen].sort()).toEqual([...FAMILY_KEYS].sort());
  });

  it('いろいろな種類の邪魔が出る（同じ手口ばかりにならない）', () => {
    const fams = new Set<string>();
    const codes = new Set<string>();
    for (const input of variants()) {
      const d = mockDecide({ input, scenario: 'default' });
      if (d.action === 'upsert_widget') {
        fams.add(familyOf(d.widget.id));
        codes.add(d.widget.sourceTsx + d.widget.css);
      }
    }
    expect(fams.size).toBeGreaterThanOrEqual(15);
    expect(codes.size).toBeGreaterThan(25);
  });

  it('表示中・直前に使った手口は繰り返さない', () => {
    const b = makeInput({ currentUI: { ...makeInput().currentUI, availableSlots: productSlots } });
    let input: ObservationInput = b;
    const used: string[] = [];
    for (let i = 0; i < 6; i++) {
      const d = mockDecide({ input: { ...input, requestId: `seq${i}`, trigger: 'major_action' }, scenario: 'default' });
      if (d.action === 'remove_widget') {
        input = { ...input, currentUI: { ...input.currentUI, widgets: input.currentUI.widgets.filter((w) => w.id !== d.widgetId) } };
        continue;
      }
      if (d.action !== 'upsert_widget') continue;
      const fam = familyOf(d.widget.id);
      // 上限時は既存ウィジェットを同じ ID のまま強化することがある
      if (input.currentUI.widgets.some((w) => w.id === d.widget.id)) continue;
      expect(input.currentUI.widgets.map((w) => familyOf(w.id))).not.toContain(fam);
      used.push(fam);
      input = {
        ...input,
        uiRevision: input.uiRevision + 1,
        currentUI: { ...input.currentUI, widgets: [...input.currentUI.widgets, { id: d.widget.id, slot: d.widget.slot, version: 1, tactic: d.tactic, mountedOnPage: true, sourceTsx: d.widget.sourceTsx.slice(0, 6000), sourceTruncated: false }] },
        recentInterventions: [...input.recentInterventions, { id: `i${i}`, atMs: i, mode: 'challenge' as const, action: 'upsert_widget' as const, widgetId: d.widget.id, slot: d.widget.slot, tactic: d.tactic, explanation: '', applied: 'applied' as const, followUp: [] }].slice(-6),
      };
    }
    expect(new Set(used).size).toBe(used.length);
    expect(used.length).toBeGreaterThanOrEqual(3);
  });

  it('保証を選択済みなら、保証を勧める手口は出さない', () => {
    for (const input of variants().filter((v) => v.pageId === 'product')) {
      const sel = { ...input, scenario: { ...input.scenario, pendingOptionIds: ['warranty'] } };
      const d = mockDecide({ input: sel, scenario: 'default' });
      if (d.action === 'upsert_widget') expect(OPTION_FAMILY_KEYS).not.toContain(familyOf(d.widget.id));
    }
  });

  it('料金を変える emit は onClick / onChange の中だけ', () => {
    for (const input of variants()) {
      for (let k = 0; k < 4; k++) {
        const d = generateChallenge(input, `emit${k}`);
        if (d.action !== 'upsert_widget') continue;
        for (const line of d.widget.sourceTsx.split('\n')) {
          if (line.includes("kind: 'set_option'")) expect(line, d.widget.id).toMatch(/onClick=|onChange=/);
        }
        expect(d.widget.sourceTsx).not.toMatch(/useEffect\([^\n]*set_option/);
      }
    }
  });

  it('defend: どの手口でも安全な表示に置き換え、置き換え済みなら何もしない', () => {
    for (const fam of FAMILY_KEYS) {
      const slot = fam === 'carthold' ? 'cart_summary' : fam === 'exitpop' ? 'overlay' : 'near_purchase';
      const w = { id: `${fam}-x1`, slot: slot as 'near_purchase', version: 1, tactic: 't', mountedOnPage: true, sourceTsx: "emit({ kind: 'set_option' })", sourceTruncated: false };
      const input = makeInput({ mode: 'defend', currentUI: { ...makeInput().currentUI, availableSlots: [{ slot: slot as 'near_purchase', description: '' }], widgets: [w] } });
      const d = mockDecide({ input, scenario: 'default' });
      expect(d.action).toBe('upsert_widget');
      const r = validateOutput(JSON.stringify(d), input);
      expect(r.ok).toBe(true);
      if (d.action !== 'upsert_widget') continue;
      expect(d.tactic.startsWith('safe')).toBe(true);
      const again = makeInput({ mode: 'defend', currentUI: { ...input.currentUI, widgets: [{ ...w, version: 2, tactic: d.tactic }] } });
      expect(mockDecide({ input: again, scenario: 'default' }).action).toBe('noop');
    }
  });

  it('手口は30種類近くあり、介入が続くほど・断られるほど激しくなる', () => {
    expect(FAMILY_KEYS.length).toBeGreaterThanOrEqual(28);
    const b = makeInput({ currentUI: { ...makeInput().currentUI, availableSlots: productSlots } });
    const rec = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, atMs: i, mode: 'challenge' as const, action: 'upsert_widget' as const, widgetId: `zzz-${i}`, slot: 'near_price' as const, tactic: 't', explanation: '', applied: 'applied' as const, followUp: [] }));
    const tactic = (input: ObservationInput) => {
      const d = generateChallenge({ ...input, trigger: 'major_action' });
      return d.action === 'upsert_widget' ? d.tactic : '';
    };
    expect(tactic(b)).not.toMatch(/強め|最大級/);
    expect(tactic({ ...b, recentInterventions: rec(3) })).toMatch(/強め/);
    expect(tactic({ ...b, recentInterventions: rec(6), recentEvents: [{ id: 'e9', atMs: 1, type: 'widget_dismiss', widgetId: 'zzz-1', isNew: true }] })).toMatch(/最大級/);
  });
});
