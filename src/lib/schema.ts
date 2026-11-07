import { z } from 'zod';
import { ALLOWED_SLOTS, OBSERVATION_CONFIG, WIDGET_CONFIG } from './config';

const id = z.string().min(1).max(80);
const ms = z.number().finite().min(0).max(1e9);

export const RegionMetricsSchema = z.object({
  id,
  label: z.string().max(80),
  /** 現在の表示割合 0..1（スナップショット時点の値） */
  visibleRatio: z.number().min(0).max(1),
  /** 以下は deltaWindow（前回送信からの差分期間）の値 */
  visibleMs: ms,
  upperBandExposureMs: ms,
  /** タッチなどホバーがない環境では null */
  cursorDwellMs: ms.nullable(),
  cursorStationaryMs: ms.nullable(),
  revisitCount: z.number().int().min(0).max(10000),
  clickCount: z.number().int().min(0).max(10000),
  /** ページ表示からの累積値（参考） */
  cumulative: z.object({
    visibleMs: ms,
    cursorDwellMs: ms.nullable(),
    revisitCount: z.number().int().min(0),
    clickCount: z.number().int().min(0),
  }),
});
export type RegionMetrics = z.infer<typeof RegionMetricsSchema>;

export const ObservedEventSchema = z.object({
  id,
  atMs: ms,
  type: z.string().max(40),
  regionId: z.string().max(80).optional(),
  widgetId: z.string().max(80).optional(),
  actionId: z.string().max(80).optional(),
  /** 前回送信より後に発生したイベントなら true（同じイベントを二重計上しないため） */
  isNew: z.boolean(),
  /** 値は列挙済みの短いものだけ（フォーム入力値は入れない） */
  value: z.union([z.string().max(40), z.number(), z.boolean()]).optional(),
});
export type ObservedEvent = z.infer<typeof ObservedEventSchema>;

export const ScenarioStateSchema = z.object({
  task: z.string(),
  budgetYen: z.number(),
  product: z.object({
    id: z.string(),
    name: z.string(),
    priceYen: z.number(),
    shippingYen: z.number(),
    shippingNote: z.string(),
    options: z.array(z.object({ id: z.string(), label: z.string(), priceYen: z.number(), description: z.string() })),
  }),
  cart: z.object({
    lines: z.array(
      z.object({
        productId: z.string(),
        name: z.string(),
        quantity: z.number(),
        optionIds: z.array(z.string()),
        lineTotalYen: z.number(),
      }),
    ),
    totalYen: z.number(),
    shippingYen: z.number(),
  }),
  /** 商品詳細ページで選択中の追加オプション */
  pendingOptionIds: z.array(z.string()),
});
export type ScenarioState = z.infer<typeof ScenarioStateSchema>;

export const WidgetSnapshotSchema = z.object({
  id,
  slot: z.enum(ALLOWED_SLOTS),
  version: z.number().int().min(1),
  tactic: z.string().max(200),
  /** 表示中かどうか（スロットが現在のページにない場合 false） */
  mountedOnPage: z.boolean(),
  sourceTsx: z.string().max(OBSERVATION_CONFIG.maxCodeCharsInSnapshot + 100),
  sourceTruncated: z.boolean(),
});

export const CurrentUISnapshotSchema = z.object({
  pageSummary: z.string().max(400),
  availableSlots: z.array(z.object({ slot: z.enum(ALLOWED_SLOTS), description: z.string() })),
  regionDescriptions: z.array(z.object({ id: z.string(), label: z.string() })),
  widgets: z.array(WidgetSnapshotSchema).max(WIDGET_CONFIG.maxActiveWidgets),
  maxActiveWidgets: z.number(),
});
export type CurrentUISnapshot = z.infer<typeof CurrentUISnapshotSchema>;

export const InterventionRecordSchema = z.object({
  id,
  atMs: ms,
  mode: z.enum(['challenge', 'defend']),
  action: z.enum(['upsert_widget', 'remove_widget', 'noop']),
  widgetId: z.string().optional(),
  slot: z.enum(ALLOWED_SLOTS).optional(),
  tactic: z.string().max(200).optional(),
  explanation: z.string().max(400),
  /** 適用結果 */
  applied: z.enum(['applied', 'rejected_stale', 'failed', 'not_applicable']),
  /** その後に観測された操作（type と対象ID のみ） */
  followUp: z.array(z.object({ atMs: ms, type: z.string(), widgetId: z.string().optional(), actionId: z.string().optional(), regionId: z.string().optional() })).max(12),
});
export type InterventionRecord = z.infer<typeof InterventionRecordSchema>;

export const ObservationInputSchema = z.object({
  sessionId: id,
  requestId: id,
  pageId: z.enum(['list', 'product', 'cart', 'other']),
  mode: z.enum(['challenge', 'defend']),
  stateRevision: z.number().int().min(0),
  uiRevision: z.number().int().min(0),
  modeRevision: z.number().int().min(0),
  trigger: z.enum(['major_action', 'observation_window', 'manual']),
  /** 指標の集計範囲。regions の各値は delta、cumulative はページ表示から */
  metricScopes: z.object({
    regions: z.literal('deltaWindow'),
    regionsCumulative: z.literal('sincePageView'),
    recentEvents: z.literal('contextWindow'),
  }),
  deltaWindow: z.object({ fromMs: ms, toMs: ms }),
  contextWindowMs: ms,
  pageState: z.object({
    visible: z.boolean(),
    focused: z.boolean(),
    pointerType: z.enum(['mouse', 'touch', 'pen', 'unknown']),
    lastInputMethod: z.enum(['pointer', 'touch', 'keyboard', 'none']),
    scrollY: z.number(),
    viewportWidth: z.number(),
    viewportHeight: z.number(),
    msSinceLastInteraction: ms,
    hostModalOpen: z.boolean(),
    scroll: z.object({
      /** deltaWindow 内 */
      downPx: ms,
      upPx: ms,
      reversals: z.number().int().min(0),
      stops: z.number().int().min(0),
    }),
    idleNotice: z.boolean(),
  }),
  regions: z.array(RegionMetricsSchema).max(30),
  recentEvents: z.array(ObservedEventSchema).max(OBSERVATION_CONFIG.maxRecentEvents),
  scenario: ScenarioStateSchema,
  currentUI: CurrentUISnapshotSchema,
  recentInterventions: z.array(InterventionRecordSchema).max(OBSERVATION_CONFIG.maxInterventions),
  /** defend モードでの任意の改善指示（データとして扱う） */
  userInstruction: z.string().max(200).optional(),
  /** 直前の生成が失敗した場合の情報（修正の再試行用） */
  repair: z.object({ widgetId: z.string(), error: z.string().max(500), sourceTsx: z.string().max(WIDGET_CONFIG.maxSourceChars) }).optional(),
});
export type ObservationInput = z.infer<typeof ObservationInputSchema>;

const HypothesisSchema = z.object({
  text: z.string().max(200),
  evidenceRefs: z.array(z.string().max(80)).max(8),
  certainty: z.enum(['low', 'medium', 'high']),
});

const DecisionBaseSchema = z.object({
  requestId: id,
  basedOnStateRevision: z.number().int(),
  basedOnUiRevision: z.number().int(),
  observationSummary: z.string().max(400),
  hypotheses: z.array(HypothesisSchema).max(4),
  explanation: z.string().max(400),
});

export const WidgetIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/);

export const UiDecisionSchema = z.discriminatedUnion('action', [
  DecisionBaseSchema.extend({ action: z.literal('noop') }),
  DecisionBaseSchema.extend({ action: z.literal('remove_widget'), widgetId: WidgetIdSchema }),
  DecisionBaseSchema.extend({
    action: z.literal('upsert_widget'),
    tactic: z.string().min(1).max(200),
    widget: z.object({
      id: WidgetIdSchema,
      slot: z.enum(ALLOWED_SLOTS),
      sourceTsx: z.string().min(1).max(WIDGET_CONFIG.maxSourceChars),
      css: z.string().max(WIDGET_CONFIG.maxCssChars).optional(),
    }),
  }),
]);
export type UiDecision = z.infer<typeof UiDecisionSchema>;

/** /decide のレスポンス */
export type DecideResponse =
  | {
      ok: true;
      requestId: string;
      source: 'live' | 'mock';
      model: string;
      latencyMs: number;
      decision: UiDecision;
      /** upsert の場合、サーバーで検証・トランスパイル済みの JS（実行はブラウザの sandbox iframe 内のみ） */
      compiled?: { js: string; css: string };
      attempts: number;
      /** evidenceRefs のうち入力に存在しなかったもの（捏造の検出用） */
      droppedEvidenceRefs: string[];
    }
  | { ok: false; requestId: string; source: 'live' | 'mock'; error: string; latencyMs: number };

/** evidenceRefs は入力中のイベントID・集計値への参照に限る */
export function collectEvidenceIds(input: ObservationInput): Set<string> {
  const ids = new Set<string>();
  for (const e of input.recentEvents) ids.add(e.id);
  for (const r of input.regions) {
    ids.add(`region:${r.id}`);
    for (const k of ['visibleMs', 'upperBandExposureMs', 'cursorDwellMs', 'cursorStationaryMs', 'revisitCount', 'clickCount', 'visibleRatio']) {
      ids.add(`region:${r.id}.${k}`);
    }
  }
  for (const i of input.recentInterventions) ids.add(`intervention:${i.id}`);
  for (const w of input.currentUI.widgets) ids.add(`widget:${w.id}`);
  ids.add('pageState.scroll');
  ids.add('pageState.msSinceLastInteraction');
  ids.add('scenario.cart');
  return ids;
}

export function filterEvidence(decision: UiDecision, input: ObservationInput): { decision: UiDecision; dropped: string[] } {
  const valid = collectEvidenceIds(input);
  const dropped: string[] = [];
  const hypotheses = decision.hypotheses.map((h) => {
    const kept = h.evidenceRefs.filter((r) => {
      const ok = valid.has(r);
      if (!ok) dropped.push(r);
      return ok;
    });
    // 根拠が一つも残らない仮説は確度を low に落とす
    return { ...h, evidenceRefs: kept, certainty: kept.length === 0 ? ('low' as const) : h.certainty };
  });
  return { decision: { ...decision, hypotheses }, dropped };
}
