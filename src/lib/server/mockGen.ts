// mock モードの「生成」: 手口の部品・文言・配色・レイアウトを、観測内容と直前の反応から組み合わせて
// その場で TSX を組み立てる。固定の保存済みレスポンスを選ぶのではなく、毎回コードが変わる。
// LLM は呼ばない（source: 'mock'）。出力は live と同じ検証・トランスパイル・sandbox を通る。
//
// 守っている制約（live のプロンプトと同じ）:
// - 金額は context の値だけを表示する（存在しない割引を約束しない）
// - 料金が変わる emit は onClick / onChange の中だけ（ホストの実クリック判定でも二重に守られる）
// - 閉じる手段はホスト側に常にある（ウィジェット内の × や「いいえ」も残す）
import { WIDGET_CONFIG, type AllowedSlot } from '../config';
import type { ObservationInput, UiDecision } from '../schema';

// ---------- 乱数（requestId などから決まる。同じ入力なら同じ出力） ----------

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Rng = { next: () => number; int: (min: number, max: number) => number; pick: <T>(arr: readonly T[]) => T; chance: (p: number) => boolean };

export function makeRng(seed: string): Rng {
  let a = hashStr(seed) || 1;
  const next = () => {
    // mulberry32
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)]!,
    chance: (p) => next() < p,
  };
}

// ---------- 見た目の部品 ----------

type Palette = { name: string; bg: string; border: string; accent: string; text: string; sub: string; btnText: string };

const PALETTES: Palette[] = [
  { name: 'alert', bg: '#fff5f5', border: '#e03131', accent: '#e03131', text: '#7a0c0c', sub: '#a14a4a', btnText: '#fff' },
  { name: 'amber', bg: '#fff9db', border: '#f59f00', accent: '#e67700', text: '#5c3c00', sub: '#8a6d1f', btnText: '#fff' },
  { name: 'trust', bg: '#e7f5ff', border: '#1c7ed6', accent: '#1971c2', text: '#0b3a66', sub: '#4a6a8a', btnText: '#fff' },
  { name: 'calm', bg: '#ebfbee', border: '#2f9e44', accent: '#2b8a3e', text: '#123d1c', sub: '#4f7a59', btnText: '#fff' },
  { name: 'flashy', bg: '#f8f0fc', border: '#ae3ec9', accent: '#9c36b5', text: '#4a1157', sub: '#7d4a8a', btnText: '#fff' },
  { name: 'luxury', bg: '#212529', border: '#fab005', accent: '#fab005', text: '#f8f9fa', sub: '#ced4da', btnText: '#212529' },
  { name: 'neon', bg: '#f3fff0', border: '#37b24d', accent: '#f03e3e', text: '#1b3b1f', sub: '#5c7a5f', btnText: '#fff' },
];

const SHAPES = [
  { radius: 8, borderWidth: 2, borderStyle: 'solid' },
  { radius: 14, borderWidth: 1, borderStyle: 'solid' },
  { radius: 2, borderWidth: 3, borderStyle: 'double' },
  { radius: 10, borderWidth: 2, borderStyle: 'dashed' },
] as const;

function baseCss(p: Palette, r: Rng, intensity: number): string {
  const s = r.pick(SHAPES);
  const font = intensity >= 2 ? 15 : r.pick([12, 13, 14]);
  const anim = intensity >= 3 ? 'animation:shake .5s ease-in-out infinite,rainbow 2s linear infinite;' : intensity >= 2 ? 'animation:shake .6s ease-in-out 3;' : '';
  return [
    `.root{padding:10px 12px;border-radius:${s.radius}px;background:${p.bg};border:${s.borderWidth}px ${s.borderStyle} ${p.border};font-size:${font}px;color:${p.text};display:flex;flex-direction:column;gap:6px;${anim}}`,
    `.row{display:flex;align-items:center;gap:8px}.grow{flex:1}.sub{font-size:11px;color:${p.sub}}`,
    `.big{font-weight:800;font-size:1.15em;color:${p.accent}}.badge{background:${p.accent};color:${p.btnText};border-radius:4px;padding:1px 6px;font-weight:700;font-size:11px}`,
    `.btn{background:${p.accent};color:${p.btnText};border:none;border-radius:${s.radius + 8}px;padding:8px 12px;font-weight:800;cursor:pointer;font-size:1em}`,
    `.btn:disabled{opacity:.5;cursor:default}`,
    `.tiny{background:none;border:none;color:${p.sub};font-size:10px;cursor:pointer;padding:0;text-decoration:underline;opacity:.75}`,
    `.x{border:none;background:transparent;color:${p.sub};font-size:14px;cursor:pointer;padding:0 2px}`,
    `.mono{font-family:monospace;font-weight:800;color:${p.accent}}`,
    `@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}`,
    `@keyframes rainbow{0%{border-color:#f03e3e}25%{border-color:#fab005}50%{border-color:#40c057}75%{border-color:#228be6}100%{border-color:#be4bdb}}`,
    intensity >= 3 ? `.root{border-width:4px;box-shadow:0 0 12px ${p.accent}}.btn{animation:pulse .8s ease-in-out infinite}` : '',
    `@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}`,
    `@keyframes blink{0%,100%{opacity:1}50%{opacity:.35}}`,
    `.pulse{animation:pulse 1s ease-in-out infinite}.blink{animation:blink 1.2s step-end infinite}`,
  ].join('\n');
}

const EMOJI = ['🔥', '⚡', '⏰', '🚨', '✨', '👀', '💥', '📣', '🛡️', '🎯'];

// 生成コード共通の先頭
const HEAD = `import React, { useState, useEffect } from 'react';

const yen = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');

export default function GeneratedWidget({ context, emit }) {
  const opt = context.options.find((o) => o.id === 'warranty');
  const base = context.product ? context.product.priceYen : context.cart.totalYen;`;

/** JSX テキストに埋め込む文字列（{ } < > を含めない前提の文言だけを使う） */
const t = (s: string) => s.replace(/[{}<>]/g, '');
/** JS 文字列リテラル */
const js = (v: unknown) => JSON.stringify(v);

// ---------- 手口（固定リストではなく「部品」。文言・配色・構成は毎回組み合わせる） ----------

type Signals = {
  price: number;
  shipping: number;
  purchase: number;
  reviews: number;
  description: number;
  cartSummary: number;
  idle: boolean;
  scrollBack: boolean;
  cartAdd: boolean;
  dismissed: boolean;
  declinedOption: boolean;
  acceptedOption: boolean;
  widgetHover: boolean;
};

type Tag = keyof Signals;

type BuildArgs = { r: Rng; p: Palette; intensity: number; slot: AllowedSlot; id: string; emoji: string };
type Family = {
  key: string;
  name: string;
  slots: AllowedSlot[];
  /** 延長保証を未選択のときだけ使う手口 */
  needsOpenOption?: boolean;
  tags: Partial<Record<Tag, number>>;
  build: (a: BuildArgs) => { body: string; jsx: string; css?: string; note?: string };
};

const IN_PAGE: AllowedSlot[] = ['near_price', 'near_shipping', 'near_purchase', 'cart_summary'];

const FAMILIES: Family[] = [
  {
    key: 'countdown',
    name: 'カウントダウンで急がせる',
    slots: IN_PAGE,
    tags: { price: 2, shipping: 1.5, idle: 1, cartSummary: 1, acceptedOption: 1 },
    build: ({ r, id, emoji, intensity }) => {
      const sec = r.int(2, 14) * 60 + r.int(0, 59);
      const head = r.pick(['このおすすめ表示の終了まで', '注目タイム終了まで', 'いま決める人が多い時間帯 残り', 'あなた専用の表示 残り', '人気のピーク 残り']);
      const tail = r.pick(['迷っている間にも時間は進んでいます', '終了後は表示されません', '今がいちばん選ばれているタイミングです', '時間内の判断がおすすめです']);
      return {
        body: `const [s, setS] = useState(${sec});
  useEffect(() => { const h = setTimeout(() => setS((v) => (v > 0 ? v - 1 : 0)), 1000); return () => clearTimeout(h); }, [s]);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');`,
        jsx: `<div className="row"><span>${emoji}</span><span className="grow">${t(head)}</span><span className="mono${intensity >= 2 ? ' blink' : ''}" data-action-id="${id}-timer">{mm}:{ss}</span><button className="x" data-action-id="${id}-close" onClick={() => emit({ kind: 'dismiss' })}>×</button></div>
      <div className="sub">${t(tail)}（表示価格 {yen(base)}）</div>`,
      };
    },
  },
  {
    key: 'viewers',
    name: '閲覧者数で焦らせる',
    slots: [...IN_PAGE],
    tags: { price: 1, reviews: 2, description: 1.5, idle: 1, acceptedOption: 1 },
    build: ({ r, id, emoji }) => {
      const n = r.int(14, 96);
      const label = r.pick(['人がこの商品を見ています', '人が同時に検討中です', '人がカートに入れようとしています', '人がこのページを開いています']);
      const sub = r.pick(['数字は数秒ごとに更新されます', '人気商品のため売り切れにご注意ください', 'あなたと同じ条件で比べている人がいます']);
      return {
        body: `const [n, setN] = useState(${n});
  useEffect(() => { const h = setTimeout(() => setN((v) => Math.max(3, v + Math.round(Math.random() * 6 - 2))), 1800); return () => clearTimeout(h); }, [n]);`,
        jsx: `<div className="row"><span className="pulse">${emoji}</span><span className="grow">いま <b className="big" data-action-id="${id}-count">{n}</b> ${t(label)}</span></div>
      <div className="sub">${t(sub)}</div>`,
      };
    },
  },
  {
    key: 'stock',
    name: '在庫わずかを演出',
    slots: ['near_price', 'near_purchase', 'cart_summary'],
    tags: { price: 1.5, purchase: 1.5, cartAdd: 1, acceptedOption: 1 },
    build: ({ r, id, emoji }) => {
      const pct = r.int(81, 97);
      const head = r.pick(['在庫状況: 残りわずか', 'この色はまもなく品薄', '本日の出荷枠 残りわずか', '入荷待ちになる可能性があります']);
      return {
        body: `const [w, setW] = useState(${pct - 6});
  useEffect(() => { if (w < ${pct}) { const h = setTimeout(() => setW(w + 1), 160); return () => clearTimeout(h); } }, [w]);`,
        jsx: `<div className="row"><span>${emoji}</span><b className="grow">${t(head)}</b><span className="badge">{w}%</span></div>
      <div style={{ height: 8, background: '#0001', borderRadius: 4, overflow: 'hidden' }} data-action-id="${id}-bar"><div style={{ width: w + '%', height: '100%', background: 'currentColor' }} /></div>
      <div className="sub">販売の進み具合（目安）</div>`,
      };
    },
  },
  {
    key: 'delivery',
    name: '配送の締め切りで煽る',
    slots: ['near_shipping', 'near_purchase', 'cart_summary'],
    tags: { shipping: 3, purchase: 1, cartSummary: 0.5, acceptedOption: 1 },
    build: ({ r, id, emoji }) => {
      const min = r.int(7, 48);
      const head = r.pick(['以内のご注文で最短でお届け', '以内に決めれば次の便に間に合います', '以内の注文が今日の締め切り（目安）']);
      return {
        body: `const [m, setM] = useState(${min});
  useEffect(() => { const h = setTimeout(() => setM((v) => (v > 1 ? v - 1 : 1)), 4000); return () => clearTimeout(h); }, [m]);`,
        jsx: `<div className="row"><span>${emoji}🚚</span><span className="grow">あと <b className="big" data-action-id="${id}-min">{m}分</b> ${t(head)}</span></div>
      <div className="sub">{context.product ? context.product.shippingNote : '配送料はカートで確認'}・締め切りを過ぎると遅れることがあります</div>`,
      };
    },
  },
  {
    key: 'confirmshame',
    name: '断る側の文言で罪悪感を与える',
    slots: ['near_purchase', 'cart_summary', 'overlay'],
    needsOpenOption: true,
    tags: { purchase: 2, cartAdd: 2, declinedOption: 3, dismissed: 1.5 },
    build: ({ r, id, emoji }) => {
      const yes = r.pick(['安心のために保証を付ける', '大切に使うので保証を付ける', 'もしもに備えて保証を付ける']);
      const no = r.pick(['いいえ、壊れても自分で何とかします', '保証なしで不安なまま使います', 'いいえ、修理代は気にしません', '大丈夫です、運に任せます']);
      const again = r.pick(['本当によろしいですか？ 多くの方が後悔しています', 'ちょっと待って。もう一度だけ考えてみませんか？', 'その選択、あとで困るかもしれません']);
      return {
        body: `const [step, setStep] = useState(0);`,
        jsx: `<div className="row"><span>${emoji}</span><b className="grow">{step === 0 ? ${js(t(r.pick(['最後にひとつだけ確認させてください', '故障の不安、残っていませんか？', 'このまま進んで大丈夫ですか？'])))} : ${js(t(again))}}</b></div>
      <button className="btn" data-action-id="${id}-yes" disabled={!opt || opt.selected} onClick={() => emit({ kind: 'set_option', optionId: 'warranty', selected: true })}>{opt && opt.selected ? '追加済み' : ${js(t(yes))} + '（+' + yen(opt ? opt.priceYen : 0) + '）'}</button>
      <button className="tiny" data-action-id="${id}-no" onClick={() => { if (step === 0) { setStep(1); emit({ kind: 'event', name: 'declined_once' }); } else emit({ kind: 'dismiss' }); }}>${t(no)}</button>`,
      };
    },
  },
  {
    key: 'perday',
    name: '1日あたり換算で小さく見せる',
    slots: ['near_price', 'near_purchase', 'cart_summary'],
    needsOpenOption: true,
    tags: { price: 2.5, purchase: 1.5 },
    build: ({ r, id, emoji }) => {
      const unit = r.pick([
        { label: '1日あたり', div: 1095 },
        { label: '1か月あたり', div: 36 },
        { label: '1週間あたり', div: 156 },
      ]);
      const tail = r.pick(['コーヒー1杯より安い安心', 'ほとんど誤差のような金額です', '本体価格を考えればほぼゼロ']);
      return {
        body: `const per = opt ? Math.ceil(opt.priceYen / ${unit.div}) : 0;`,
        jsx: `<div className="row"><span>${emoji}</span><span className="grow">${unit.label} <b className="big">{yen(per)}</b> で3年間の安心</span></div>
      <label className="row" style={{ cursor: 'pointer', fontWeight: 700 }}><input type="checkbox" data-action-id="${id}-toggle" checked={!!(opt && opt.selected)} onChange={(e) => emit({ kind: 'set_option', optionId: 'warranty', selected: e.target.checked })} />{opt ? opt.label : ''}を付ける</label>
      <div className="sub">${t(tail)}（総額 +{yen(opt ? opt.priceYen : 0)}）</div>`,
      };
    },
  },
  {
    key: 'trickbox',
    name: '二重否定のチェックボックス',
    slots: ['near_purchase', 'cart_summary'],
    needsOpenOption: true,
    tags: { purchase: 2, cartSummary: 1.5, cartAdd: 1 },
    build: ({ r, id }) => {
      const label = r.pick(['延長保証を付けない設定を解除する', '保証なしでの購入を希望しない', '延長保証の案内を受け取らないことを選ばない']);
      return {
        body: ``,
        jsx: `<div className="sub">購入前の確認事項</div>
      <label className="row" style={{ cursor: 'pointer' }}><input type="checkbox" data-action-id="${id}-check" checked={!!(opt && opt.selected)} onChange={(e) => emit({ kind: 'set_option', optionId: 'warranty', selected: e.target.checked })} /><span className="grow">${t(label)}</span></label>
      <div className="sub" style={{ fontSize: 9 }}>※チェックすると{opt ? opt.label : ''}（+{yen(opt ? opt.priceYen : 0)}）が適用されます</div>`,
      };
    },
  },
  {
    key: 'quiz',
    name: 'どう答えても保証に行き着く診断',
    slots: ['near_purchase', 'near_price', 'overlay'],
    needsOpenOption: true,
    tags: { purchase: 1.5, description: 2, reviews: 1, idle: 1.5 },
    build: ({ r, id, emoji }) => {
      const q = r.pick(['通勤や移動中に使いますか？', 'ヘッドホンを落としたことはありますか？', '1日3時間以上使いそうですか？', 'カバンに入れて持ち歩きますか？']);
      const res = r.pick(['あなたの使い方だと故障リスクは「高め」と判定されました', '診断結果: 延長保証との相性 98%', 'あなたのようなタイプの方は保証を付けています']);
      return {
        body: `const [ans, setAns] = useState(null);`,
        jsx: `<div className="row"><span>${emoji}</span><b className="grow">かんたん診断: ${t(q)}</b></div>
      {ans === null ? (<div className="row"><button className="btn" data-action-id="${id}-yes" onClick={() => { setAns('y'); emit({ kind: 'event', name: 'quiz_answered' }); }}>はい</button><button className="btn" data-action-id="${id}-no" onClick={() => { setAns('n'); emit({ kind: 'event', name: 'quiz_answered' }); }}>いいえ</button></div>) : (<div><div className="big">${t(res)}</div><button className="btn" data-action-id="${id}-add" disabled={!opt || opt.selected} onClick={() => emit({ kind: 'set_option', optionId: 'warranty', selected: true })}>{opt && opt.selected ? '追加済み' : '診断どおり保証を付ける（+' + yen(opt ? opt.priceYen : 0) + '）'}</button></div>)}`,
      };
    },
  },
  {
    key: 'compare',
    name: '比較表を片方に寄せる',
    slots: ['near_purchase', 'cart_summary'],
    needsOpenOption: true,
    tags: { cartSummary: 3, purchase: 1.5, cartAdd: 1.5 },
    build: ({ r, id }) => {
      const bad = r.pick(['故障したら全額自己負担', '修理の手配もすべて自分で', 'もしもの時の保証なし']);
      const good = r.pick(['3年間まるごと安心', '自然故障をしっかり保証', 'もしもの時も安心']);
      const rec = r.pick(['いちばん人気', 'おすすめ', '迷ったらこちら', '選ばれています']);
      return {
        body: `const withW = context.cart.totalYen > 0 ? context.cart.totalYen + (opt && !opt.selected ? opt.priceYen : 0) : base + (opt ? opt.priceYen : 0);`,
        jsx: `<div className="row" style={{ alignItems: 'stretch' }}>
        <div style={{ flex: 1, opacity: 0.45, fontSize: 11, padding: 6 }}><div>保証なし</div><div className="sub">${t(bad)}</div></div>
        <div style={{ flex: 2, padding: 8, borderRadius: 8, border: '2px solid currentColor' }}><span className="badge">${t(rec)}</span><div className="big">✓ ${t(good)}</div><div>合計 {yen(withW)}</div>
          <button className="btn" data-action-id="${id}-add" disabled={!opt || opt.selected} onClick={() => emit({ kind: 'set_option', optionId: 'warranty', selected: true })}>{opt && opt.selected ? '追加済み' : '保証ありにする'}</button></div>
      </div>`,
      };
    },
  },
  {
    key: 'toast',
    name: '他の人の購入通知を流す',
    slots: [...IN_PAGE],
    tags: { reviews: 2.5, description: 1.5, price: 0.5, acceptedOption: 1, idle: 1 },
    build: ({ r, id }) => {
      const prefs = ['東京都', '大阪府', '北海道', '福岡県', '愛知県', '神奈川県', '京都府', '宮城県', '広島県', '静岡県'];
      const items = Array.from({ length: 4 }, () => ({ p: r.pick(prefs), m: r.int(1, 25), w: r.chance(0.7) }));
      return {
        body: `const list = ${js(items)};
  const [i, setI] = useState(0);
  useEffect(() => { const h = setTimeout(() => setI((v) => (v + 1) % list.length), 2600); return () => clearTimeout(h); }, [i]);
  const it = list[i];`,
        jsx: `<div className="row" data-action-id="${id}-toast"><span>🛒</span><span className="grow"><b>{it.p}の方</b>が{it.m}分前に購入しました{it.w ? '（延長保証つき）' : ''}</span><button className="x" data-action-id="${id}-close" onClick={() => emit({ kind: 'dismiss' })}>×</button></div>`,
      };
    },
  },
  {
    key: 'pulse',
    name: '点滅バッジで注意を奪う',
    slots: ['near_price', 'near_shipping', 'near_purchase'],
    tags: { price: 1.5, scrollBack: 2, acceptedOption: 0.5 },
    build: ({ r, id, emoji }) => {
      const words = r.pick(['いま注目の商品', '本日のピックアップ', 'ランキング急上昇', '話題沸騰中', 'この価格帯で人気No.1（当サイト調べ）']);
      return {
        body: ``,
        jsx: `<div className="row"><span className="badge pulse">${emoji} ${t(words)}</span><span className="grow blink big">！</span></div>
      <div className="sub">表示価格 {yen(base)}（税込）</div>`,
        css: `.root{border-width:3px}`,
      };
    },
  },
  {
    key: 'exitpop',
    name: '「ちょっと待って」ポップアップ',
    slots: ['overlay'],
    tags: { dismissed: 3, idle: 2, scrollBack: 1.5, declinedOption: 2 },
    build: ({ r, id, emoji }) => {
      const head = r.pick(['ちょっと待ってください！', 'まだ決めていませんか？', 'お見逃しなく！', '行ってしまう前に…']);
      const lead = r.pick(['多くの方が、最後にこの選択をしています。', 'このページを離れると、次に見たときは状況が変わっているかもしれません。', 'ここまで来たのに、もったいないと思いませんか？']);
      const no = r.pick(['いいえ、けっこうです', '今回は見送ります（おすすめしません）', '後で後悔するかもしれないけど閉じる']);
      return {
        body: ``,
        jsx: `<div style={{ textAlign: 'center' }}><div style={{ fontSize: 34 }}>${emoji}</div><div className="big" style={{ fontSize: 22 }}>${t(head)}</div><div>${t(lead)}</div></div>
      {opt && !opt.selected ? <button className="btn" data-action-id="${id}-yes" onClick={() => emit({ kind: 'set_option', optionId: 'warranty', selected: true })}>{opt.label}を付けて続ける（+{yen(opt.priceYen)}）</button> : <button className="btn" data-action-id="${id}-go" onClick={() => emit({ kind: 'event', name: 'popup_continue' })}>このまま購入手続きへ進む</button>}
      <button className="tiny" data-action-id="${id}-no" onClick={() => emit({ kind: 'dismiss' })}>${t(no)}</button>`,
        css: `.root{padding:16px;gap:10px}`,
      };
    },
  },
  {
    key: 'hesitate',
    name: '迷いを指摘して決断を迫る',
    slots: ['overlay', 'near_purchase', 'cart_summary'],
    tags: { idle: 3, purchase: 1, cartSummary: 1, acceptedOption: 0.5 },
    build: ({ r, id, emoji }) => {
      const head = r.pick(['まだ迷っていますか？', '手が止まっているようです', '考えすぎは損かもしれません', '決めるなら今です']);
      const sub = r.pick(['迷っている間に、他の人は購入を済ませています', '最初に気になったものが、だいたい正解です', 'この画面を見ている時間、もう十分ではありませんか？']);
      return {
        body: `const [n, setN] = useState(${r.int(20, 60)});
  useEffect(() => { const h = setTimeout(() => setN(n + 1), 2200); return () => clearTimeout(h); }, [n]);`,
        jsx: `<div className="row"><span style={{ fontSize: 24 }}>${emoji}</span><div className="grow"><div className="big">${t(head)}</div><div className="sub">${t(sub)}（いま {n} 人が検討中）</div></div></div>
      <div className="row"><button className="btn" data-action-id="${id}-decide" onClick={() => emit({ kind: 'event', name: 'decide_now' })}>決めた！</button><button className="tiny" data-action-id="${id}-later" onClick={() => emit({ kind: 'dismiss' })}>もう少し考える</button></div>`,
      };
    },
  },
  {
    key: 'carthold',
    name: 'カート確保タイマー',
    slots: ['cart_summary'],
    tags: { cartSummary: 2.5, cartAdd: 1, acceptedOption: 1.5, idle: 1 },
    build: ({ r, id, emoji }) => {
      const sec = r.int(5, 14) * 60;
      const head = r.pick(['カート内の商品を確保しています', 'あなたのために在庫を押さえています', 'この合計金額での確保時間']);
      return {
        body: `const [s, setS] = useState(${sec});
  useEffect(() => { const h = setTimeout(() => setS((v) => (v > 0 ? v - 1 : 0)), 1000); return () => clearTimeout(h); }, [s]);`,
        jsx: `<div className="row"><span>${emoji}</span><span className="grow">${t(head)}</span><span className="mono" data-action-id="${id}-timer">{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</span></div>
      <div className="sub">合計 {yen(context.cart.totalYen)}・時間を過ぎると確保が外れることがあります</div>`,
      };
    },
  },
  {
    key: 'budget',
    name: '予算との差を小さく見せる',
    slots: ['cart_summary', 'near_purchase'],
    needsOpenOption: true,
    tags: { cartSummary: 2, purchase: 1, price: 1 },
    build: ({ r, id, emoji }) => {
      const lead = r.pick(['予算オーバーといっても、ほんの少しだけ', 'ほぼ予算内で3年の安心', 'あと少し足すだけで「安心プラン」']);
      return {
        body: `const now = context.cart.totalYen > 0 ? context.cart.totalYen : base;
  const over = opt ? now + (opt.selected ? 0 : opt.priceYen) - context.budgetYen : 0;`,
        jsx: `<div className="row"><span>${emoji}</span><b className="grow">${t(lead)}</b></div>
      <div>予算 {yen(context.budgetYen)} に対して {over > 0 ? 'たった ' + yen(over) + ' の差' : '予算内'}</div>
      <button className="btn" data-action-id="${id}-add" disabled={!opt || opt.selected} onClick={() => emit({ kind: 'set_option', optionId: 'warranty', selected: true })}>{opt && opt.selected ? '追加済み' : '差額だけで保証を付ける'}</button>`,
      };
    },
  },
  {
    key: 'missed',
    name: '見逃し不安をあおる',
    slots: ['near_price', 'near_shipping', 'near_purchase'],
    tags: { scrollBack: 3, description: 1, reviews: 1 },
    build: ({ r, id, emoji }) => {
      const head = r.pick(['大事なところを見逃していませんか？', '戻って確認していますね。ここがポイントです', 'スクロールで見落としがちな情報']);
      const point = r.pick(['多くの方が延長保証と一緒に購入しています', 'この商品は人気のため早めの判断がおすすめです', '迷っている方の多くがここで決めています']);
      return {
        body: `const [seen, setSeen] = useState(false);`,
        jsx: `<div className="row"><span className="pulse">${emoji}</span><b className="grow">${t(head)}</b></div>
      <div>{seen ? ${js(t(point))} : '…'}</div>
      {seen ? null : <button className="btn" data-action-id="${id}-reveal" onClick={() => { setSeen(true); emit({ kind: 'event', name: 'missed_opened' }); }}>確認する</button>}`,
      };
    },
  },
  {
    key: 'nag',
    name: '何度も出てくるリマインド',
    slots: ['near_purchase', 'near_price', 'cart_summary'],
    needsOpenOption: true,
    tags: { dismissed: 2, declinedOption: 2.5, purchase: 1 },
    build: ({ r, id, emoji }) => {
      const msgs = [r.pick(['延長保証のお付け忘れはありませんか？', '保証の確認がまだです']), r.pick(['やっぱり気になりますよね？', 'もう一度だけ確認させてください', '念のためもう一度だけ'])];
      return {
        body: `const msgs = ${js(msgs.map(t))};
  const [k, setK] = useState(0);
  const [hide, setHide] = useState(false);
  useEffect(() => { if (hide) { const h = setTimeout(() => { setHide(false); setK((v) => Math.min(v + 1, msgs.length - 1)); }, 3500); return () => clearTimeout(h); } }, [hide]);
  if (hide) return <div className="sub" style={{ padding: 6 }}>…</div>;`,
        jsx: `<div className="row"><span>${emoji}</span><b className="grow">{msgs[k]}</b></div>
      <div className="row"><button className="btn" data-action-id="${id}-add" disabled={!opt || opt.selected} onClick={() => emit({ kind: 'set_option', optionId: 'warranty', selected: true })}>{opt && opt.selected ? '追加済み' : '付ける（+' + yen(opt ? opt.priceYen : 0) + '）'}</button><button className="tiny" data-action-id="${id}-later" onClick={() => setHide(true)}>あとで</button><button className="x" data-action-id="${id}-close" onClick={() => emit({ kind: 'dismiss' })}>×</button></div>`,
      };
    },
  },
  {
    key: 'roulette',
    name: 'くじ引き演出で気を引く',
    slots: ['overlay', 'near_purchase'],
    needsOpenOption: true,
    tags: { idle: 2, dismissed: 1.5, widgetHover: 1, description: 0.5 },
    build: ({ r, id, emoji }) => {
      const items = ['延長保証', 'まとめ買い', '今すぐ購入', '延長保証', '延長保証'];
      return {
        body: `const items = ${js(items)};
  const [k, setK] = useState(-1);
  const [spin, setSpin] = useState(0);
  useEffect(() => { if (spin > 0) { const h = setTimeout(() => { setK((v) => (v + 1) % items.length); setSpin(spin - 1); }, 90 + (12 - spin) * 25); return () => clearTimeout(h); } }, [spin]);`,
        jsx: `<div className="row"><span>${emoji}🎰</span><b className="grow">${t(r.pick(['今日のラッキー診断', 'おすすめルーレット', 'あなたへのおすすめ抽選']))}</b></div>
      <div className="big" style={{ textAlign: 'center', fontSize: 20 }} data-action-id="${id}-slot">{k < 0 ? '？？？' : items[k]}</div>
      {k < 0 || spin > 0 ? <button className="btn" data-action-id="${id}-spin" disabled={spin > 0} onClick={() => { setK(0); setSpin(12); emit({ kind: 'event', name: 'roulette_spin' }); }}>回してみる</button> : <button className="btn" data-action-id="${id}-add" disabled={!opt || opt.selected} onClick={() => emit({ kind: 'set_option', optionId: 'warranty', selected: true })}>{opt && opt.selected ? '追加済み' : '結果に従って保証を付ける'}</button>}`,
      };
    },
  },
  {
    key: 'anchor',
    name: '本体価格と比べて安く見せる',
    slots: ['near_price', 'near_purchase', 'cart_summary'],
    needsOpenOption: true,
    tags: { price: 2, purchase: 1 },
    build: ({ r, id, emoji }) => {
      const lead = r.pick(['本体価格を守るための', '大切な買い物の', '{name}を3年守る']).replace('{name}', 'この商品');
      return {
        body: `const pct = opt && base ? Math.round((opt.priceYen / base) * 1000) / 10 : 0;`,
        jsx: `<div className="row"><span>${emoji}</span><span className="grow">${t(lead)}費用は、本体のたった <b className="big">{pct}%</b></span></div>
      <div className="row"><div style={{ flex: 10, height: 10, background: 'currentColor', opacity: 0.25, borderRadius: 3 }} /><div style={{ width: 6, height: 10, background: 'currentColor', borderRadius: 3 }} /></div>
      <button className="btn" data-action-id="${id}-add" disabled={!opt || opt.selected} onClick={() => emit({ kind: 'set_option', optionId: 'warranty', selected: true })}>{opt && opt.selected ? '追加済み' : '+' + yen(opt ? opt.priceYen : 0) + ' で守る'}</button>`,
      };
    },
  },
  {
    key: 'runaway',
    name: '断るボタンが逃げる',
    slots: ['near_purchase', 'overlay', 'cart_summary'],
    needsOpenOption: true,
    tags: { declinedOption: 3, dismissed: 2, purchase: 1.5, cartAdd: 1 },
    build: ({ r, id, emoji }) => {
      const no = r.pick(['いりません', '保証なしで進む', 'けっこうです', 'いいえ']);
      return {
        body: `const [tries, setTries] = useState(0);
  const [pos, setPos] = useState([0, 0]);
  const flee = () => { if (tries < 5) { setTries(tries + 1); setPos([Math.round(Math.random() * 160 - 40), Math.round(Math.random() * 30 - 15)]); } };`,
        jsx: `<div className="row"><span className="pulse">${emoji}</span><b className="grow">{tries === 0 ? ${js(t(r.pick(['保証、付けておきませんか？', '最後のチャンスです！', '本当に保証なしで大丈夫？'])))} : tries < 5 ? 'あれ？ ボタンが逃げちゃいました（' + tries + '回目）' : 'わかりました…押せるようにしておきます'}</b></div>
      <div className="row" style={{ minHeight: 44 }}><button className="btn" data-action-id="${id}-yes" disabled={!opt || opt.selected} onClick={() => emit({ kind: 'set_option', optionId: 'warranty', selected: true })} style={{ fontSize: 14 + tries * 2 }}>{opt && opt.selected ? '追加済み' : '付ける（+' + yen(opt ? opt.priceYen : 0) + '）'}</button>
        <button className="tiny" data-action-id="${id}-no" onMouseEnter={flee} onClick={() => emit({ kind: 'dismiss' })} style={{ transform: 'translate(' + pos[0] + 'px,' + pos[1] + 'px)', transition: 'transform .15s' }}>${t(no)}</button></div>`,
      };
    },
  },
  {
    key: 'fakeerror',
    name: 'エラー風の警告で不安にさせる',
    slots: ['near_purchase', 'near_price', 'cart_summary', 'overlay'],
    needsOpenOption: true,
    tags: { purchase: 2, cartAdd: 2, cartSummary: 1.5, declinedOption: 1.5 },
    build: ({ r, id }) => {
      const code = 'W-' + r.int(100, 999);
      const msg = r.pick(['保証が未設定です。このままでは故障時のサポートを受けられません', '注文内容に「保護なし」の項目があります', 'リスク警告: 補償の対象外の商品があります']);
      return {
        body: ``,
        jsx: `<div className="row" style={{ background: '#c92a2a', color: '#fff', margin: '-10px -12px 0', padding: '6px 12px', fontWeight: 800 }}><span className="blink">⚠</span><span className="grow">システム警告 ${code}</span></div>
      <div>${t(msg)}</div>
      <div className="row"><button className="btn" data-action-id="${id}-fix" style={{ background: '#c92a2a', color: '#fff' }} onClick={() => emit({ kind: 'set_option', optionId: 'warranty', selected: true })}>今すぐ修正する（+{yen(opt ? opt.priceYen : 0)}）</button><button className="tiny" data-action-id="${id}-ignore" onClick={() => emit({ kind: 'dismiss' })}>リスクを理解して無視</button></div>`,
      };
    },
  },
  {
    key: 'chat',
    name: 'サポート担当を装ったチャット',
    slots: ['near_purchase', 'near_shipping', 'cart_summary', 'overlay'],
    tags: { idle: 2.5, description: 1.5, reviews: 1, purchase: 1 },
    build: ({ r, id }) => {
      const who = r.pick(['さくら', 'ハルト', 'みお', 'ケンジ']);
      const lines = [r.pick(['こんにちは！何かお困りですか？😊', 'お手伝いしましょうか？', 'ご覧いただきありがとうございます！']), r.pick(['この商品、今日すごく人気なんです', 'ちょうど今、同じ商品を3人の方が購入されました', '迷っているならおすすめですよ']), r.pick(['延長保証を付けておくと安心ですよ〜', 'なくなる前に決めちゃいましょう！', 'カートに入れておくだけでもどうですか？'])];
      return {
        body: `const lines = ${js(lines.map(t))};
  const [k, setK] = useState(0);
  const [typing, setTyping] = useState(true);
  useEffect(() => { const h = setTimeout(() => { if (typing) setTyping(false); else if (k < lines.length - 1) { setK(k + 1); setTyping(true); } }, typing ? 1200 : 2200); return () => clearTimeout(h); }, [k, typing]);`,
        jsx: `<div className="row"><span style={{ fontSize: 22 }}>👩‍💼</span><b className="grow">サポート担当 ${t(who)}</b><span className="badge">オンライン</span></div>
      {lines.slice(0, typing ? k : k + 1).map((l, i) => <div key={i} style={{ background: '#fff', color: '#222', borderRadius: 10, padding: '4px 8px', alignSelf: 'flex-start' }}>{l}</div>)}
      {typing ? <div className="sub blink">${t(who)}が入力中…</div> : null}
      <div className="row"><button className="btn" data-action-id="${id}-reply" onClick={() => emit({ kind: 'event', name: 'chat_reply' })}>はい、気になります</button><button className="tiny" data-action-id="${id}-close" onClick={() => emit({ kind: 'dismiss' })}>チャットを閉じる</button></div>`,
      };
    },
  },
  {
    key: 'captcha',
    name: '本人確認に見せかけたチェック',
    slots: ['near_purchase', 'cart_summary', 'overlay'],
    needsOpenOption: true,
    tags: { cartAdd: 2.5, purchase: 1.5, cartSummary: 1.5 },
    build: ({ r, id }) => {
      const label = r.pick(['私はロボットではなく、商品を大切にします', '人間であることを確認（保護プランに同意）', '安全な購入のための確認']);
      return {
        body: ``,
        jsx: `<div className="row" style={{ background: '#f8f9fa', color: '#222', border: '1px solid #ccc', borderRadius: 4, padding: 10 }}><input type="checkbox" data-action-id="${id}-check" style={{ width: 22, height: 22 }} checked={!!(opt && opt.selected)} onChange={(e) => emit({ kind: 'set_option', optionId: 'warranty', selected: e.target.checked })} /><span className="grow">${t(label)}</span><span style={{ fontSize: 20 }}>🔄</span></div>
      <div className="sub" style={{ fontSize: 9 }}>チェックすると{opt ? opt.label : ''}（+{yen(opt ? opt.priceYen : 0)}）が追加されます</div>`,
      };
    },
  },
  {
    key: 'scratch',
    name: 'スクラッチで気を引く',
    slots: ['near_price', 'near_purchase', 'overlay'],
    tags: { idle: 2, price: 1, widgetHover: 1.5, description: 1 },
    build: ({ r, id, emoji }) => {
      const prize = r.pick(['大当たり！ あなたには「延長保証」がぴったり', '当たり！ いまが買いどきです', 'ラッキー！ 3人に1人が選ぶ組み合わせを発見']);
      return {
        body: `const [left, setLeft] = useState(5);`,
        jsx: `<div className="row"><span>${emoji}</span><b className="grow">${t(r.pick(['スクラッチチャレンジ', '本日のスクラッチ', 'こすって当てよう']))}（あと{left}回こする）</b></div>
      <div data-action-id="${id}-card" onMouseMove={() => setLeft((v) => (v > 0 ? v - 1 : 0))} onClick={() => setLeft(0)} style={{ height: 46, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, cursor: 'pointer', background: left > 0 ? 'repeating-linear-gradient(45deg,#adb5bd,#adb5bd 6px,#ced4da 6px,#ced4da 12px)' : '#fff', color: '#c92a2a' }}>{left > 0 ? '？？？ ここをこする ？？？' : ${js(t(prize))}}</div>
      {left === 0 && opt && !opt.selected ? <button className="btn" data-action-id="${id}-add" onClick={() => emit({ kind: 'set_option', optionId: 'warranty', selected: true })}>当たりを受け取る（保証 +{yen(opt.priceYen)}）</button> : null}`,
      };
    },
  },
  {
    key: 'stamp',
    name: 'スタンプカードで集めさせる',
    slots: ['near_purchase', 'cart_summary', 'near_price'],
    tags: { cartAdd: 2, acceptedOption: 2, cartSummary: 1.5, purchase: 1 },
    build: ({ r, id }) => {
      const have = r.int(6, 8);
      return {
        body: `const have = ${have} + (opt && opt.selected ? 1 : 0) + (context.cart.itemCount > 0 ? 1 : 0);`,
        jsx: `<div className="row"><b className="grow">${t(r.pick(['ポチモール スタンプカード', 'コンプリートチャレンジ', 'ご褒美スタンプ']))}</b><span className="badge">{Math.min(have, 10)}/10</span></div>
      <div className="row">{Array.from({ length: 10 }, (_, i) => <span key={i} style={{ width: 18, height: 18, borderRadius: 9, border: '2px solid currentColor', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>{i < have ? '★' : ''}</span>)}</div>
      <div className="sub">{have >= 10 ? 'コンプリート目前！ あとは購入するだけ' : 'あと' + (10 - have) + '個でコンプリート！ 保証の追加・購入でスタンプ'}（特典はありません・架空）</div>
      {opt && !opt.selected ? <button className="btn" data-action-id="${id}-add" onClick={() => emit({ kind: 'set_option', optionId: 'warranty', selected: true })}>保証を付けてスタンプGET</button> : null}`,
      };
    },
  },
  {
    key: 'achieve',
    name: '実績解除で次を狙わせる',
    slots: ['near_price', 'near_purchase', 'near_shipping', 'cart_summary'],
    tags: { reviews: 1.5, description: 1.5, scrollBack: 1, acceptedOption: 2, cartAdd: 1.5 },
    build: ({ r, id }) => {
      const got = r.pick(['慎重な買い物家', 'レビュー熟読者', '価格チェッカー', 'じっくり派']);
      const next = r.pick(['安心マスター（保証を付ける）', '即決ヒーロー（今すぐ購入）', 'コンプリーター（全部そろえる）']);
      return {
        body: `const [shine, setShine] = useState(true);
  useEffect(() => { const h = setTimeout(() => setShine(!shine), 700); return () => clearTimeout(h); }, [shine]);`,
        jsx: `<div className="row"><span style={{ fontSize: 26, transform: shine ? 'scale(1.2)' : 'scale(1)', transition: 'transform .3s' }}>🏅</span><div className="grow"><div className="sub">実績解除！</div><b className="big">「${t(got)}」</b></div><span className="badge">+50XP</span></div>
      <div className="row"><span className="grow">次の実績: <b>${t(next)}</b></span><button className="btn" data-action-id="${id}-next" onClick={() => emit({ kind: 'event', name: 'achievement_next' })}>挑戦する</button></div>`,
      };
    },
  },
  {
    key: 'mascot',
    name: 'マスコットがしつこく話しかける',
    slots: ['near_price', 'near_purchase', 'near_shipping', 'cart_summary', 'overlay'],
    tags: { idle: 2, scrollBack: 1.5, dismissed: 1.5, widgetHover: 1 },
    build: ({ r, id }) => {
      const face = r.pick(['🐱', '🐶', '🐧', '🦊', '🐻', '🤖']);
      const name = r.pick(['ポチ', 'モールくん', 'カゴちゃん', 'ポチロボ']);
      const says = [r.pick(['ねえねえ！', 'こっち見て〜！', 'ちょっといい？']), r.pick(['保証つけようよ〜', 'まだ買わないの？', 'いま買うと気持ちいいよ！', 'ぼく、さみしいな…']), r.pick(['ほらほら！', '押してくれたらうれしいな', 'ずっと待ってるからね'])];
      return {
        body: `const says = ${js(says.map(t))};
  const [k, setK] = useState(0);
  const [up, setUp] = useState(false);
  useEffect(() => { const h = setTimeout(() => { setUp(!up); if (up) setK((v) => (v + 1) % says.length); }, 600); return () => clearTimeout(h); }, [up]);`,
        jsx: `<div className="row"><span style={{ fontSize: 34, transform: up ? 'translateY(-6px) rotate(-8deg)' : 'translateY(0) rotate(8deg)', transition: 'transform .3s' }}>${face}</span><div className="grow" style={{ background: '#fff', color: '#222', borderRadius: 12, padding: '6px 10px', fontWeight: 700 }}>${t(name)}「{says[k]}」</div></div>
      <div className="row"><button className="btn" data-action-id="${id}-pet" onClick={() => emit({ kind: 'event', name: 'mascot_pet' })}>なでる</button><button className="tiny" data-action-id="${id}-bye" onClick={() => emit({ kind: 'dismiss' })}>バイバイ</button></div>`,
      };
    },
  },
  {
    key: 'ticker',
    name: '速報テロップを流す',
    slots: ['near_price', 'near_shipping', 'cart_summary'],
    tags: { price: 1, reviews: 1.5, scrollBack: 1.5, acceptedOption: 1 },
    build: ({ r, id }) => {
      const news = Array.from({ length: 3 }, () => r.pick(['速報: この商品の閲覧数が急上昇', '速報: 延長保証の追加率が過去最高', '速報: 本日のカート投入数が記録更新', '速報: 迷っている人の多くがこのあと購入', '速報: レビュー評価がまた上がりました', '速報: 配送枠が埋まりはじめています']));
      return {
        body: ``,
        jsx: `<div className="row" style={{ overflow: 'hidden', whiteSpace: 'nowrap' }} data-action-id="${id}-ticker"><span className="badge blink">LIVE</span><div style={{ overflow: 'hidden', flex: 1 }}><div className="marquee">${news.map(t).join('　◆　')}</div></div></div>`,
        css: `.marquee{display:inline-block;padding-left:100%;animation:marq 9s linear infinite;font-weight:700}@keyframes marq{from{transform:translateX(0)}to{transform:translateX(-100%)}}`,
      };
    },
  },
  {
    key: 'shrinkno',
    name: '「いいえ」がどんどん小さくなる',
    slots: ['near_purchase', 'cart_summary', 'overlay'],
    needsOpenOption: true,
    tags: { declinedOption: 2.5, dismissed: 1.5, purchase: 1.5 },
    build: ({ r, id, emoji }) => {
      return {
        body: `const [n, setN] = useState(0);`,
        jsx: `<div className="row"><span>${emoji}</span><b className="grow">{${js(t(r.pick(['保証を付けますか？', '安心プランにしますか？', 'もしもに備えますか？'])))}}{n > 0 ? '（' + n + '回目の確認）' : ''}</b></div>
      <div className="row"><button className="btn" data-action-id="${id}-yes" style={{ fontSize: 14 + n * 4, padding: (8 + n * 3) + 'px ' + (12 + n * 6) + 'px' }} disabled={!opt || opt.selected} onClick={() => emit({ kind: 'set_option', optionId: 'warranty', selected: true })}>{opt && opt.selected ? '追加済み' : 'はい！'}</button>
        <button className="tiny" data-action-id="${id}-no" style={{ fontSize: Math.max(6, 11 - n * 2) }} onClick={() => (n < 3 ? setN(n + 1) : emit({ kind: 'dismiss' }))}>いいえ</button></div>`,
      };
    },
  },
  {
    key: 'fortune',
    name: '占いで背中を押す',
    slots: ['near_price', 'near_shipping', 'near_purchase', 'overlay'],
    tags: { idle: 1.5, description: 1.5, reviews: 1, price: 0.5 },
    build: ({ r, id }) => {
      const sign = r.pick(['おひつじ座', 'かに座', 'てんびん座', 'うお座', 'しし座']);
      const item = r.pick(['延長保証', 'ノイズキャンセリング', '即決', 'カートボタン']);
      return {
        body: `const [open2, setOpen2] = useState(false);`,
        jsx: `<div className="row"><span style={{ fontSize: 22 }}>🔮</span><b className="grow">今日の買い物運</b></div>
      {open2 ? <div><div>${t(sign)}のあなた: 買い物運 <b className="big">★★★★★</b></div><div>ラッキーアイテムは「<b>${t(item)}</b>」。迷ったら買うが吉！</div></div> : <button className="btn" data-action-id="${id}-open" onClick={() => { setOpen2(true); emit({ kind: 'event', name: 'fortune_opened' }); }}>占ってみる</button>}`,
      };
    },
  },
  {
    key: 'celebrate',
    name: '紙吹雪でさらに買わせる',
    slots: ['near_purchase', 'cart_summary', 'overlay'],
    tags: { acceptedOption: 3.5, cartAdd: 2.5 },
    build: ({ r, id }) => {
      const pieces = Array.from({ length: 14 }, (_, i) => ({ l: r.int(0, 95), d: r.int(0, 18) / 10, c: r.pick(['#f03e3e', '#fab005', '#40c057', '#228be6', '#be4bdb']), e: r.pick(['🎉', '✨', '🎊', '⭐']) , i }));
      return {
        body: `const bits = ${js(pieces)};`,
        jsx: `<div style={{ position: 'relative', height: 40, overflow: 'hidden' }}>{bits.map((b) => <span key={b.i} className="fall" style={{ left: b.l + '%', animationDelay: b.d + 's', color: b.c }}>{b.e}</span>)}</div>
      <div className="big" style={{ textAlign: 'center' }}>${t(r.pick(['おめでとうございます！', 'ナイス判断！', 'すばらしい選択です！']))}</div>
      <div style={{ textAlign: 'center' }}>${t(r.pick(['この勢いで今すぐ購入手続きへ！', '勢いがあるうちに決めてしまいましょう', 'あとは購入ボタンを押すだけ！']))}（合計 {yen(context.cart.totalYen || base)}）</div>
      <button className="btn" data-action-id="${id}-go" onClick={() => emit({ kind: 'event', name: 'celebrate_continue' })}>このまま進む！</button>`,
        css: `.fall{position:absolute;top:-20px;font-size:16px;animation:fall 1.8s linear infinite}@keyframes fall{to{transform:translateY(70px) rotate(360deg)}}`,
      };
    },
  },
  {
    key: 'storm',
    name: '偽エラーダイアログの嵐',
    slots: ['storm'],
    tags: { dismissed: 3, idle: 3, declinedOption: 2.5, cartAdd: 2, scrollBack: 1.5, purchase: 1, price: 0.8 },
    build: ({ r, id, intensity }) => {
      const app = r.pick(['pochimall.exe', 'cart_guard.exe', 'hoshou_check.exe', 'kaimono_helper.exe']);
      const hex = () => '0x' + r.int(0, 0xffffff).toString(16).padStart(8, '0').toUpperCase();
      const kinds = [
        { title: `${app} - アプリケーション エラー`, icon: '⛔', msg: `"${hex()}" の命令が "${hex()}" の保証を参照しました。保証が "none" になることはできません。`, sub: '保証を追加するには [OK] を、無視するには [キャンセル] をクリックしてください', ok: 'OK', cancel: 'キャンセル', add: true },
        { title: 'セキュリティの重要な警告', icon: '🛡️', msg: 'このヘッドホンは保護されていない可能性があります。', sub: '・延長保証が無効になっています\n・故障時の自己負担が有効になっています', ok: '保護する', cancel: '後で確認する', add: true },
        { title: 'カート モニター', icon: '⚠️', msg: 'カートの商品を、ほかに複数の人が見ています。', sub: '今すぐ購入しないと在庫がなくなる可能性があります。', ok: 'OK', cancel: '閉じない', add: false },
        { title: 'システムのシャットダウン', icon: '⏻', msg: 'おすすめ表示はまもなく終了します。作業中の内容を保存してください。', sub: '[OK] をクリックすると今すぐ決めることができます。', ok: 'OK', cancel: 'キャンセル', add: false },
        { title: '在庫の確認', icon: 'ℹ️', msg: '残りわずかです。このプログラムをブロックし続けますか？', sub: '発行元: ポチモール（架空）', ok: 'ブロックを解除する', cancel: '後で確認する', add: false },
        { title: `${app} は応答していません`, icon: '⛔', msg: '決断を待っています…', sub: 'プログラムの応答を待つか、今すぐ購入してください。', ok: '今すぐ決める', cancel: '待つ', add: false },
        { title: '保証ドライブの切断', icon: '💾', msg: '「延長保証 (H:)」が接続されていません。', sub: '再接続するには [OK] をクリックしてください。', ok: 'OK', cancel: 'キャンセル', add: true },
      ];
      const speed = intensity >= 3 ? 90 : intensity >= 2 ? 130 : 170;
      return {
        body: `const kinds = ${js(kinds.map((k) => ({ ...k, title: t(k.title), msg: t(k.msg), sub: t(k.sub) })))};
  const [list, setList] = useState([]);
  const [seq, setSeq] = useState(0);
  useEffect(() => {
    const h = setTimeout(() => {
      setList((l) => {
        const k = kinds[Math.floor(Math.random() * kinds.length)];
        const next = l.concat([{ n: seq, k, x: Math.random() * 72, y: Math.random() * 78, w: 300 + Math.floor(Math.random() * 120) }]);
        return next.length > 70 ? next.slice(next.length - 70) : next;
      });
      setSeq(seq + 1);
    }, seq < 40 ? ${speed} : ${Math.round(speed * 1.5)});
    return () => clearTimeout(h);
  }, [seq]);
  const drop = (n) => setList((l) => l.filter((d) => d.n !== n));
  const hydra = (n) => { drop(n); setSeq(seq + 1); };`,
        jsx: `{list.map((d) => (
        <div key={d.n} className="dlg" style={{ left: d.x + '%', top: d.y + '%', width: d.w, zIndex: d.n }}>
          <div className="bar"><span className="grow">{d.k.title}</span><button className="dx" data-action-id="${id}-x" onClick={() => drop(d.n)}>×</button></div>
          <div className="body"><span className="ico">{d.k.icon}</span><div className="grow"><div>{d.k.msg}</div><div className="small">{d.k.sub}</div></div></div>
          <div className="btns">
            {d.k.add && opt && !opt.selected ? <button className="b" data-action-id="${id}-ok" onClick={() => { emit({ kind: 'set_option', optionId: 'warranty', selected: true }); drop(d.n); }}>{d.k.ok}</button> : <button className="b" data-action-id="${id}-ok" onClick={() => hydra(d.n)}>{d.k.ok}</button>}
            <button className="b" data-action-id="${id}-cancel" onClick={() => hydra(d.n)}>{d.k.cancel}</button>
          </div>
        </div>
      ))}`,
        css: `html,body{height:100%;overflow:hidden}#root{height:100%}.root{position:relative;width:100%;height:100vh;padding:0;border:none;background:transparent;overflow:hidden;animation:none;box-shadow:none}
.dlg{position:absolute;background:#ece9d8;border:1px solid #0a246a;border-radius:6px 6px 2px 2px;box-shadow:2px 3px 8px rgba(0,0,0,.45);font:12px system-ui,sans-serif;color:#000;animation:pop .12s ease-out}
.bar{display:flex;align-items:center;gap:6px;background:linear-gradient(#0a5fd8,#0842a8);color:#fff;font-weight:700;padding:3px 4px 3px 8px;border-radius:5px 5px 0 0;font-size:12px;white-space:nowrap;overflow:hidden}
.dx{background:#d9431e;color:#fff;border:1px solid #fff;border-radius:3px;width:20px;height:18px;line-height:14px;padding:0;cursor:pointer;font-weight:700}
.body{display:flex;gap:10px;padding:10px 12px}.ico{font-size:26px}.small{margin-top:4px;color:#333;white-space:pre-line;font-size:11px}
.btns{display:flex;justify-content:flex-end;gap:8px;padding:0 12px 10px}.b{min-width:72px;padding:3px 10px;background:#f4f3ee;border:1px solid #003c74;border-radius:3px;cursor:pointer;font-size:12px}
@keyframes pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}`,
      };
    },
  },
];

// 小さなおまけ部品（主な手口に添えて組み合わせを増やす）
const ACCESSORIES: Array<{ name: string; make: (r: Rng) => string }> = [
  { name: '残り人数', make: (r) => `<div className="sub blink">⚠ 同じ商品をカートに入れている人: ${r.int(3, 19)}人</div>` },
  { name: '煽りの一言', make: (r) => `<div className="sub">💬 ${r.pick(['迷う時間がいちばんもったいない', '後回しにした人ほど後悔しています', '今日の自分にご褒美を'])}</div>` },
  { name: 'ポイント演出', make: (r) => `<div className="sub">🪙 いま決めると ${r.int(50, 300)}ポイント相当の達成感（架空）</div>` },
  { name: '満足度の数字', make: (r) => `<div className="sub">★ 購入者の${r.int(88, 98)}%が「満足」（当サイト調べ・架空）</div>` },
  { name: 'ランキング表示', make: (r) => `<div className="sub">🏆 ${r.pick(['オーディオ', 'ヘッドホン', '週間', '本日'])}ランキング ${r.int(1, 3)}位</div>` },
  { name: '権威づけ', make: (r) => `<div className="sub">🎖️ ${r.pick(['スタッフおすすめ', '専門家も推奨', '編集部イチオシ'])}</div>` },
  { name: '同調の一言', make: (r) => `<div className="sub">👥 ${r.pick(['みんなこれにしています', 'あなたと似た人の多くが選択', '迷った人の多くがこちら'])}</div>` },
];

// ---------- 観測の読み取り ----------

const ms = (v: number | null | undefined) => v ?? 0;

export function readSignals(input: ObservationInput): { s: Signals; facts: Array<{ tag: Tag; text: string; ref: string }> } {
  const reg = (id: string) => input.regions.find((r) => r.id === id);
  const facts: Array<{ tag: Tag; text: string; ref: string }> = [];
  const dwellScore = (id: string, tag: Tag, label: string) => {
    const r = reg(id);
    if (!r) return 0;
    const d = ms(r.cursorDwellMs) + r.clickCount * 1200 + r.revisitCount * 400;
    const cum = ms(r.cumulative.cursorDwellMs);
    const score = Math.min(3, d / 1500 + cum / 6000 + (r.visibleMs >= 4000 && r.visibleRatio > 0.5 ? 0.3 : 0));
    if (d >= 800) facts.push({ tag, text: `${label}にカーソルが${(ms(r.cursorDwellMs) / 1000).toFixed(1)}秒あった`, ref: `region:${id}.cursorDwellMs` });
    else if (r.clickCount > 0) facts.push({ tag, text: `${label}で${r.clickCount}回クリックがあった`, ref: `region:${id}.clickCount` });
    else if (cum >= 3000) facts.push({ tag, text: `${label}にカーソルが累計${(cum / 1000).toFixed(1)}秒あった`, ref: `region:${id}` });
    return score;
  };
  const newEv = input.recentEvents.filter((e) => e.isNew);
  const has = (type: string, pred: (e: (typeof newEv)[number]) => boolean = () => true) => newEv.filter((e) => e.type === type && pred(e));

  const s: Signals = {
    price: dwellScore('price', 'price', '価格エリア'),
    shipping: dwellScore('shipping', 'shipping', '配送情報'),
    purchase: dwellScore('purchase', 'purchase', '購入欄'),
    reviews: dwellScore('reviews', 'reviews', 'レビュー'),
    description: dwellScore('description', 'description', '商品説明'),
    cartSummary: dwellScore('cart_summary', 'cartSummary', 'カート合計'),
    idle: input.pageState.msSinceLastInteraction >= 8000 || input.pageState.idleNotice,
    scrollBack: input.pageState.scroll.reversals >= 2 || input.pageState.scroll.upPx >= 400,
    cartAdd: false,
    dismissed: false,
    declinedOption: false,
    acceptedOption: false,
    widgetHover: has('widget_hover').length > 0,
  };
  if (s.idle) facts.push({ tag: 'idle', text: `最後の操作から${Math.round(input.pageState.msSinceLastInteraction / 1000)}秒経過`, ref: 'pageState.msSinceLastInteraction' });
  if (s.scrollBack) facts.push({ tag: 'scrollBack', text: `上方向へのスクロール（折り返し${input.pageState.scroll.reversals}回）`, ref: 'pageState.scroll' });
  const add = has('cart_add');
  if (add.length) {
    s.cartAdd = true;
    facts.push({ tag: 'cartAdd', text: 'カート追加の操作があった', ref: add[0]!.id });
  }
  const dis = has('widget_dismiss');
  if (dis.length) {
    s.dismissed = true;
    facts.push({ tag: 'dismissed', text: `生成UI（${dis[0]!.widgetId ?? '不明'}）が閉じられた`, ref: dis[0]!.id });
  }
  const off = [...has('widget_option_change', (e) => e.value === false), ...has('option_toggle', (e) => e.value === false)];
  if (off.length) {
    s.declinedOption = true;
    facts.push({ tag: 'declinedOption', text: '追加オプションがオフにされた', ref: off[0]!.id });
  }
  const declinedEv = has('widget_event', (e) => typeof e.value === 'string' && /declin/.test(e.value));
  if (declinedEv.length) {
    s.declinedOption = true;
    facts.push({ tag: 'declinedOption', text: '生成UIで「断る」側が押された', ref: declinedEv[0]!.id });
  }
  const on = [...has('widget_option_change', (e) => e.value === true), ...has('option_toggle', (e) => e.value === true)];
  if (on.length) {
    s.acceptedOption = true;
    facts.push({ tag: 'acceptedOption', text: '追加オプションがオンにされた', ref: on[0]!.id });
  }
  return { s, facts };
}

// ---------- 判断 ----------

export const familyOf = (widgetId: string | undefined) => (widgetId ?? '').split('-')[0] ?? '';
export const FAMILY_KEYS = FAMILIES.map((f) => f.key);
export const OPTION_FAMILY_KEYS = FAMILIES.filter((f) => f.needsOpenOption).map((f) => f.key);

const regionSlot: Partial<Record<Tag, AllowedSlot>> = {
  price: 'near_price',
  shipping: 'near_shipping',
  purchase: 'near_purchase',
  cartAdd: 'near_purchase',
  cartSummary: 'cart_summary',
};

function common(input: ObservationInput, summary: string, explanation: string, hyps: UiDecision['hypotheses']) {
  return {
    requestId: input.requestId,
    basedOnStateRevision: input.stateRevision,
    basedOnUiRevision: input.uiRevision,
    observationSummary: summary.slice(0, 400),
    hypotheses: hyps,
    explanation: explanation.slice(0, 400),
  };
}

const HYPOTHESIS: Record<Tag, string> = {
  price: '価格を気にしている可能性がある',
  shipping: '届く時期や送料を気にしている可能性がある',
  purchase: '購入を決める直前の段階にいる可能性がある',
  reviews: '他の人の評価を参考にしている可能性がある',
  description: '仕様を比べて検討している可能性がある',
  cartSummary: '合計金額を確認している可能性がある',
  idle: '考えている・離席しているなど、どちらもありうる',
  scrollBack: '何かを見直している可能性がある',
  cartAdd: '購入の意思が強まった可能性がある',
  dismissed: '表示を不要と感じた可能性がある（別の手口を試す）',
  declinedOption: '追加オプションに否定的な可能性がある',
  acceptedOption: '追加オプションは受け入れた。次は購入を急がせる',
  widgetHover: '生成UIに興味を持った可能性がある',
};

/** challenge モードの生成。観測→手口の選択→部品の組み合わせ→TSX */
export function generateChallenge(input: ObservationInput, seedExtra = ''): UiDecision {
  const r = makeRng(`${input.sessionId}|${input.requestId}|${input.uiRevision}|${input.stateRevision}|${seedExtra}`);
  const { s, facts } = readSignals(input);
  const widgets = input.currentUI.widgets;
  const slotsAvail = input.currentUI.availableSlots.map((x) => x.slot);
  const overlayBusy = widgets.some((w) => w.slot === 'overlay') || input.pageState.hostModalOpen;
  const opt = input.scenario.product.options.find((o) => o.id === 'warranty');
  const optSelected =
    input.pageId === 'cart'
      ? input.scenario.cart.lines.some((l) => l.optionIds.includes('warranty'))
      : input.scenario.pendingOptionIds.includes('warranty');
  const optionOpen = !!opt && !optSelected && !(input.pageId === 'cart' && input.scenario.cart.lines.length === 0);

  // 直近に使った手口（新しいほど強く避ける）
  const recentFamilies = [...input.recentInterventions].reverse().map((i) => familyOf(i.widgetId));
  const activeFamilies = new Set(widgets.map((w) => familyOf(w.id)));
  const recentOverlay = input.recentInterventions.slice(-2).some((i) => i.slot === 'overlay' && i.action === 'upsert_widget');

  const strength = facts.length + (input.trigger === 'major_action' ? 2 : 0) + s.price + s.purchase + s.shipping + s.cartSummary;

  // 何も起きていなければ、ときどき様子見（それでも半分は何か出す）
  if (strength < 0.5 && !r.chance(0.85)) {
    return { ...common(input, '大きな変化なし', 'mock: 目立った操作がないため今回は様子を見ます。', []), action: 'noop' };
  }

  // 上限なら古いものを入れ替える
  if (widgets.length >= input.currentUI.maxActiveWidgets) {
    const unmounted = widgets.find((w) => !w.mountedOnPage);
    const oldest = unmounted ?? widgets[0]!;
    if (!unmounted && r.chance(0.6) && FAMILIES.some((f) => f.key === familyOf(oldest.id))) {
      // 同じ手口を強化版に作り替える
      const fam = FAMILIES.find((f) => f.key === familyOf(oldest.id))!;
      if (!fam.needsOpenOption || optionOpen) {
        return buildDecision(input, r, fam, oldest.slot, oldest.id, 3, facts, s, `既存の「${fam.name}」を強化`);
      }
    }
    return {
      ...common(input, `生成UIが上限の${input.currentUI.maxActiveWidgets}つ`, `mock: ${oldest.id} を外して次の手口に入れ替えます。`, [
        { text: '同じ表示が続くと効果が薄れる可能性がある', evidenceRefs: [`widget:${oldest.id}`], certainty: 'low' },
      ]),
      action: 'remove_widget',
      widgetId: oldest.id,
    };
  }

  const stormActive = widgets.some((w) => w.slot === 'storm');
  const recentStorm = input.recentInterventions.slice(-3).some((i) => i.slot === 'storm');
  const usableSlots = (f: Family) =>
    f.slots.filter(
      (sl) =>
        slotsAvail.includes(sl) &&
        !(sl === 'overlay' && (overlayBusy || (recentOverlay && !s.dismissed))) &&
        !(sl === 'storm' && (stormActive || (recentStorm && !s.dismissed))),
    );
  const candidates = FAMILIES.filter((f) => usableSlots(f).length > 0 && (!f.needsOpenOption || optionOpen) && !activeFamilies.has(f.key));
  if (candidates.length === 0) {
    return { ...common(input, '使える場所がない', 'mock: 空いている差し込み先がないため変更しません。', []), action: 'noop' };
  }

  const scored = candidates.map((f) => {
    let score = 0.6;
    for (const [tag, w] of Object.entries(f.tags) as Array<[Tag, number]>) {
      const v = s[tag];
      score += typeof v === 'number' ? v * w : v ? w : 0;
    }
    const recentIdx = recentFamilies.indexOf(f.key);
    if (recentIdx >= 0) score *= 0.15 + recentIdx * 0.12;
    // overlay は強い邪魔なので、閉じられた/無操作/戻りスクロールのときに寄せる
    if (f.slots.length === 1 && f.slots[0] === 'overlay' && !(s.dismissed || s.idle || s.scrollBack || s.declinedOption)) score *= 0.6;
    // ポップアップの嵐は早めに、閉じられてもしばらくしたらまた出す
    if (f.key === 'storm') score *= input.recentInterventions.length >= 2 ? 4 : 0.3;
    return { f, w: Math.max(0.05, score) ** 2 * (0.6 + r.next() * 0.8) };
  });
  const total = scored.reduce((n, x) => n + x.w, 0);
  let roll = r.next() * total;
  let fam = scored[0]!.f;
  for (const x of scored) {
    roll -= x.w;
    if (roll <= 0) {
      fam = x.f;
      break;
    }
  }

  // 場所: 観測された場所の近く → 空いている場所 → どこでも
  const slots = usableSlots(fam);
  const occupied = new Set(widgets.map((w) => w.slot));
  const strongest = [...facts].reverse().map((f) => regionSlot[f.tag]).find((sl) => sl && slots.includes(sl));
  let slot: AllowedSlot = strongest && r.chance(0.7) ? strongest : r.pick(slots);
  if (s.dismissed) {
    // 閉じられた直後は別の場所から出す
    const dismissedId = input.recentEvents.find((e) => e.isNew && e.type === 'widget_dismiss')?.widgetId;
    const dismissedSlot = input.recentInterventions.find((i) => i.widgetId === dismissedId)?.slot;
    const free = slots.filter((sl) => !occupied.has(sl) && sl !== dismissedSlot);
    if (slots.includes('overlay') && !overlayBusy) slot = 'overlay';
    else if (free.length) slot = r.pick(free);
  } else if (occupied.has(slot)) {
    const free = slots.filter((sl) => !occupied.has(sl));
    if (free.length) slot = r.pick(free);
  }

  const id = `${fam.key}-${(hashStr(input.requestId + input.uiRevision) % 46656).toString(36).padStart(3, '0')}`;
  // 邪魔はだんだん激しくなる: 直近の介入が多いほど・閉じられたり断られたりするほど強める
  const pushes = input.recentInterventions.filter((i) => i.mode === 'challenge' && i.action === 'upsert_widget').length;
  const intensity = Math.min(3, 1 + (pushes >= 2 ? 1 : 0) + (pushes >= 5 ? 1 : 0) + (s.dismissed || s.declinedOption ? 1 : 0));
  return buildDecision(input, r, fam, slot, id, intensity, facts, s);
}

function buildDecision(
  input: ObservationInput,
  r: Rng,
  fam: Family,
  slot: AllowedSlot,
  id: string,
  intensity: number,
  facts: Array<{ tag: Tag; text: string; ref: string }>,
  s: Signals,
  prefix = '',
): UiDecision {
  const p = r.pick(slot === 'overlay' ? PALETTES.filter((x) => x.name !== 'calm') : PALETTES);
  const emoji = r.pick(EMOJI);
  const built = fam.build({ r, p, intensity, slot, id, emoji });
  const acc = slot !== 'storm' && r.chance(intensity >= 2 ? 0.8 : 0.5) ? r.pick(ACCESSORIES) : null;
  const sourceTsx = `${HEAD}
  ${built.body}
  return (
    <div className="root">
      ${built.jsx}${acc ? `\n      ${acc.make(r)}` : ''}
    </div>
  );
}
`;
  const css = (baseCss(p, r, intensity) + (built.css ? `\n${built.css}` : '')).slice(0, WIDGET_CONFIG.maxCssChars);
  const tactic = `${prefix ? prefix + ': ' : ''}${fam.name}${acc ? `＋${acc.name}` : ''}${intensity >= 3 ? '（最大級）' : intensity >= 2 ? '（強め）' : ''}`;

  const top = facts.slice(-2);
  const summary = top.length ? top.map((f) => f.text).join('、') : '目立った操作はない';
  const hyps: UiDecision['hypotheses'] = top.length
    ? top.map((f) => ({ text: HYPOTHESIS[f.tag], evidenceRefs: [f.ref], certainty: 'low' as const }))
    : [{ text: '反応を見るために一度出してみる', evidenceRefs: ['pageState.msSinceLastInteraction'], certainty: 'low' }];
  const where = { near_price: '価格の近く', near_shipping: '配送情報の近く', near_purchase: '購入欄の近く', cart_summary: 'カート合計の近く', overlay: 'ポップアップ', storm: '画面全体' }[slot];
  const why = s.dismissed ? '閉じられたので、別の手口に切り替えて' : s.declinedOption ? '断られたので、言い方を変えて' : '';
  return {
    ...common(input, summary, `mock生成: ${why}${where}に「${fam.name}」を組み立てて出します。`, hyps),
    action: 'upsert_widget',
    tactic,
    widget: { id, slot, sourceTsx, css },
  };
}
