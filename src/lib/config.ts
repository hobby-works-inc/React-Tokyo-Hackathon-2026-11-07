// 変更可能な初期値。仕様上の「固定ルール」ではなく調整用の設定。

export const OBSERVATION_CONFIG = {
  /** 定期確認の間隔 */
  observationIntervalMs: 5000,
  /** 主要操作のデバウンス */
  majorActionDebounceMs: 250,
  /** LLM に渡す直近の文脈 */
  contextWindowMs: 30000,
  /** 画面上部の帯（ビューポート高さに対する割合） */
  upperBand: { top: 0.1, bottom: 0.4 },
  /** カーソル停止とみなすまでの時間 */
  cursorStationaryAfterMs: 600,
  /** mousemove の間引き */
  pointerSampleMs: 100,
  /** 集計ティック */
  tickMs: 250,
  /** スクロール停止とみなすまでの時間 */
  scrollStopMs: 400,
  /** 同じ無操作状態を送ってよい回数 */
  maxIdleSends: 2,
  /** 無操作状態を送る最小間隔 */
  idleSendMinIntervalMs: 15000,
  /** LLM に渡す履歴の上限 */
  maxRecentEvents: 40,
  maxInterventions: 6,
  maxCodeCharsInSnapshot: 6000,
} as const;

export const WIDGET_CONFIG = {
  /** 一度に変更するのは原則1ウィジェット */
  maxChangesPerDecision: 1,
  /** 同時表示の最大数 */
  maxActiveWidgets: 3,
  /** 生成コードの最大サイズ */
  maxSourceChars: 12000,
  maxCssChars: 4000,
  /** iframe で描画完了を待つ時間 */
  renderTimeoutMs: 4000,
  /** コード修正の再試行回数 */
  maxRepairAttempts: 1,
  slotMaxHeightPx: {
    near_price: 240,
    near_shipping: 240,
    near_purchase: 340,
    cart_summary: 360,
    overlay: 480,
  },
} as const;

export const ALLOWED_SLOTS = ['near_price', 'near_shipping', 'near_purchase', 'cart_summary', 'overlay'] as const;
export type AllowedSlot = (typeof ALLOWED_SLOTS)[number];

export const SLOT_DESCRIPTIONS: Record<AllowedSlot, string> = {
  near_price: '商品詳細の価格の近く',
  near_shipping: '商品詳細の配送情報の近く',
  near_purchase: '商品詳細の購入操作（カートに追加）の近く',
  cart_summary: 'カートの合計金額付近',
  overlay: 'ホストが管理するポップアップ領域（外枠と閉じるボタンはホスト側）',
};

export const PAGE_SLOTS: Record<string, AllowedSlot[]> = {
  product: ['near_price', 'near_shipping', 'near_purchase', 'overlay'],
  cart: ['cart_summary', 'overlay'],
  list: ['overlay'],
};
