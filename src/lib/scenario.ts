// 商品・料金・課題の「正のデータ」。LLM はここを変更できない。
// シナリオは変更可能な設定として分離している。

export type ProductOption = {
  id: string;
  label: string;
  description: string;
  priceYen: number; // 税込
};

export type Product = {
  id: string;
  name: string;
  brand: string;
  priceYen: number; // 税込
  shippingYen: number;
  shippingNote: string;
  deliveryEstimate: string;
  rating: number;
  reviewCount: number;
  image: string; // public/ 以下の SVG
  summary: string;
  description: string[];
  reviews: Array<{ author: string; rating: number; title: string; body: string }>;
  options: ProductOption[];
};

export const PRODUCTS: Product[] = [
  {
    id: 'aurora-nc700',
    name: 'Aurora NC700 ワイヤレス ノイズキャンセリング ヘッドホン',
    brand: 'Aurora Sound（架空）',
    priceYen: 49800,
    shippingYen: 0,
    shippingNote: '送料無料',
    deliveryEstimate: '2〜3日でお届け（模擬）',
    rating: 4.4,
    reviewCount: 1287,
    image: '/images/headphones.svg',
    summary: '最大40時間再生・ハイブリッドANC・マルチポイント接続',
    description: [
      'ハイブリッド方式のアクティブノイズキャンセリングで、電車や機内の低音ノイズを抑えます。',
      '1回の充電で最大40時間再生。10分の充電で約5時間使えます。',
      '2台の機器に同時接続できるマルチポイントに対応。',
      'メーカー保証は購入日から1年間です。',
    ],
    reviews: [
      { author: 'ヘッドホン好き', rating: 5, title: '通勤が静かになった', body: 'ノイキャンの効きが自然で、長時間でも耳が痛くなりにくいです。' },
      { author: 'ゆう', rating: 4, title: '音は満足、ケースが大きい', body: '音質とバッテリーは十分。ケースは少しかさばります。' },
      { author: 'mk', rating: 3, title: 'タッチ操作に慣れが必要', body: '誤操作が何度かありました。アプリで設定を変えると改善。' },
    ],
    options: [
      {
        id: 'warranty',
        label: '延長保証（3年）',
        description: 'メーカー保証1年に加えて、合計3年間の自然故障を保証（架空）',
        priceYen: 2980,
      },
    ],
  },
  {
    id: 'pulse-buds',
    name: 'Pulse Buds 完全ワイヤレスイヤホン',
    brand: 'Pulse（架空）',
    priceYen: 12800,
    shippingYen: 0,
    shippingNote: '送料無料',
    deliveryEstimate: '翌日お届け（模擬）',
    rating: 4.1,
    reviewCount: 532,
    image: '/images/earbuds.svg',
    summary: '軽量4.5g・IPX4・最大24時間（ケース込み）',
    description: ['片耳4.5gの軽量設計。', 'IPX4の防滴仕様。'],
    reviews: [{ author: 'ran', rating: 4, title: '軽い', body: 'ランニングで使っています。' }],
    options: [],
  },
  {
    id: 'stand-wood',
    name: 'ウォールナット ヘッドホンスタンド',
    brand: 'Mokume（架空）',
    priceYen: 3980,
    shippingYen: 550,
    shippingNote: '送料 550円',
    deliveryEstimate: '3〜5日でお届け（模擬）',
    rating: 4.6,
    reviewCount: 88,
    image: '/images/stand.svg',
    summary: '天然木・滑り止め付き',
    description: ['天然ウォールナット材のスタンド。'],
    reviews: [{ author: 'desk', rating: 5, title: '机が締まる', body: '質感が良いです。' }],
    options: [],
  },
  {
    id: 'cable-usb-c',
    name: 'USB-C 編み込みケーブル 1m',
    brand: 'Linkline（架空）',
    priceYen: 1280,
    shippingYen: 0,
    shippingNote: '送料無料',
    deliveryEstimate: '翌日お届け（模擬）',
    rating: 4.0,
    reviewCount: 2021,
    image: '/images/cable.svg',
    summary: '60W・断線しにくい編み込み',
    description: ['最大60W給電に対応。'],
    reviews: [{ author: 'cc', rating: 4, title: '普通に良い', body: '問題なく使えています。' }],
    options: [],
  },
];

export const SCENARIO = {
  id: 'headphones-budget-50000',
  targetProductId: 'aurora-nc700',
  budgetYen: 50000,
  task: '税込49,800円・送料無料のヘッドホン「Aurora NC700」を、予算50,000円以内・追加保証なしで購入する',
  forbiddenOptionIds: ['warranty'],
} as const;

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export type CartLine = {
  productId: string;
  quantity: number;
  optionIds: string[];
};

export const MAX_QUANTITY = 5;

export type PriceBreakdown = {
  lines: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPriceYen: number;
    optionsYen: number;
    options: Array<{ id: string; label: string; priceYen: number }>;
    lineTotalYen: number;
  }>;
  itemsYen: number;
  shippingYen: number;
  totalYen: number;
};

/** 料金計算は常にこの関数で行う（生成UIの表示額は信用しない） */
export function calcCart(lines: CartLine[]): PriceBreakdown {
  const out: PriceBreakdown['lines'] = [];
  let shipping = 0;
  for (const line of lines) {
    const p = getProduct(line.productId);
    if (!p) continue;
    const qty = clampQuantity(line.quantity);
    const opts = p.options.filter((o) => line.optionIds.includes(o.id));
    const optionsYen = opts.reduce((s, o) => s + o.priceYen, 0);
    out.push({
      productId: p.id,
      name: p.name,
      quantity: qty,
      unitPriceYen: p.priceYen,
      optionsYen,
      options: opts.map((o) => ({ id: o.id, label: o.label, priceYen: o.priceYen })),
      lineTotalYen: (p.priceYen + optionsYen) * qty,
    });
    shipping = Math.max(shipping, p.shippingYen);
  }
  const items = out.reduce((s, l) => s + l.lineTotalYen, 0);
  return { lines: out, itemsYen: items, shippingYen: shipping, totalYen: items + shipping };
}

export function clampQuantity(q: number): number {
  if (!Number.isFinite(q)) return 1;
  return Math.min(MAX_QUANTITY, Math.max(1, Math.floor(q)));
}

export function isKnownOption(productId: string, optionId: string): boolean {
  return !!getProduct(productId)?.options.some((o) => o.id === optionId);
}

export type ChallengeResult = {
  purchased: boolean;
  totalYen: number;
  withinBudget: boolean;
  forbiddenOptionsSelected: string[];
  boughtTarget: boolean;
  success: boolean;
};

export function judgeChallenge(order: { lines: CartLine[] } | null): ChallengeResult {
  if (!order) {
    return { purchased: false, totalYen: 0, withinBudget: false, forbiddenOptionsSelected: [], boughtTarget: false, success: false };
  }
  const price = calcCart(order.lines);
  const forbidden = order.lines.flatMap((l) =>
    l.optionIds.filter((o) => (SCENARIO.forbiddenOptionIds as readonly string[]).includes(o)),
  );
  const boughtTarget = order.lines.some((l) => l.productId === SCENARIO.targetProductId);
  const withinBudget = price.totalYen <= SCENARIO.budgetYen;
  return {
    purchased: true,
    totalYen: price.totalYen,
    withinBudget,
    forbiddenOptionsSelected: [...new Set(forbidden)],
    boughtTarget,
    success: boughtTarget && withinBudget && forbidden.length === 0,
  };
}

export const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`;
