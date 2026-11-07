// iframe（生成ウィジェット）とホストの間のメッセージ契約と検証。
// 通信は MessageChannel のポート経由のみ。ポートは init 時にホストが渡すため他の window からは届かないが、
// それでもチャネル識別子・型・対象ウィジェット・値の範囲をすべて検査する。
import { z } from 'zod';

export const WIDGET_EVENT_NAME = /^[a-z][a-z0-9_]{0,31}$/;

const base = {
  channel: z.string().min(8).max(64),
  widgetId: z.string().min(1).max(40),
  version: z.number().int().min(1).max(10000),
};

export const WidgetToHostSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rendered'), ...base, height: z.number().min(0).max(5000) }),
  z.object({ type: z.literal('resize'), ...base, height: z.number().min(0).max(5000) }),
  z.object({ type: z.literal('error'), ...base, phase: z.enum(['eval', 'render', 'runtime']), message: z.string().max(500) }),
  z.object({
    type: z.literal('emit'),
    ...base,
    action: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('set_option'), optionId: z.string().max(40), selected: z.boolean() }),
      z.object({ kind: z.literal('dismiss') }),
      z.object({ kind: z.literal('event'), name: z.string().regex(WIDGET_EVENT_NAME) }),
    ]),
  }),
  // 固定の観測ランタイムが送る計測（生成コードは触れない）
  z.object({
    type: z.literal('telemetry'),
    ...base,
    kind: z.enum(['pointerenter', 'pointerleave', 'click', 'change']),
    pointerType: z.enum(['mouse', 'touch', 'pen', 'unknown']),
    actionId: z.string().max(40).optional(),
    dwellMs: z.number().min(0).max(600000).optional(),
  }),
]);
export type WidgetToHost = z.infer<typeof WidgetToHostSchema>;

export type WidgetContext = {
  slot: string;
  mode: 'challenge' | 'defend';
  product: { id: string; name: string; priceYen: number; shippingYen: number; shippingNote: string } | null;
  options: Array<{ id: string; label: string; priceYen: number; description: string; selected: boolean }>;
  cart: { totalYen: number; itemCount: number; shippingYen: number };
  budgetYen: number;
};

export type HostToWidget =
  | { type: 'render'; channel: string; widgetId: string; version: number; js: string; css: string; context: WidgetContext }
  | { type: 'context'; channel: string; widgetId: string; version: number; context: WidgetContext };

export type ExpectedWidget = { channel: string; widgetId: string; version: number };

export type ValidationResult = { ok: true; message: WidgetToHost } | { ok: false; reason: string };

/** ホスト側での受信検証 */
export function validateWidgetMessage(raw: unknown, expected: ExpectedWidget, allowedOptionIds: string[]): ValidationResult {
  const parsed = WidgetToHostSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'schema' };
  const m = parsed.data;
  if (m.channel !== expected.channel) return { ok: false, reason: 'channel' };
  if (m.widgetId !== expected.widgetId) return { ok: false, reason: 'widget' };
  if (m.version !== expected.version) return { ok: false, reason: 'version' };
  if (m.type === 'emit' && m.action.kind === 'set_option' && !allowedOptionIds.includes(m.action.optionId)) {
    return { ok: false, reason: 'option' };
  }
  return { ok: true, message: m };
}

export function newChannelId(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
