// /decide の本体。観測入力を検証 → LLM（live）または mock の生成（mockGen.ts）→ 出力スキーマ検証 →
// 生成 TSX の検証・トランスパイル（失敗時は最大1回だけ修正を依頼）。
// 生成コードはここでは実行しない。
import { WIDGET_CONFIG } from '../config';
import { ObservationInputSchema, UiDecisionSchema, filterEvidence, type DecideResponse, type ObservationInput, type UiDecision } from '../schema';
import { compileWidget } from '../widgetCompiler';
import { mockDecide, type MockScenario } from './mock';
import { callOpenCode, resolveFormat, type ChatTurn, type LlmConfig } from './opencode';
import { SYSTEM_PROMPT, buildRepairMessage, buildUserMessage, extractJson } from './prompt';

export type ServerEnv = {
  LLM_MODE?: string;
  OPENCODE_API_KEY?: string;
  OPENCODE_BASE_URL?: string;
  OPENCODE_MODEL?: string;
  OPENCODE_API_FORMAT?: string;
  LLM_TIMEOUT_MS?: string;
  OPENCODE_THINKING?: string;
  LLM_MAX_REQUESTS_PER_MINUTE?: string;
  DEMO_ACCESS_TOKEN?: string;
};

export type ModeInfo = { mode: 'live' | 'mock'; model: string; liveAvailable: boolean; accessTokenRequired: boolean; reason?: string };

export function resolveMode(env: ServerEnv): ModeInfo {
  const model = env.OPENCODE_MODEL || 'claude-sonnet-5-5';
  const wantsLive = (env.LLM_MODE || 'mock').toLowerCase() === 'live';
  const hasKey = !!env.OPENCODE_API_KEY;
  const accessTokenRequired = !!env.DEMO_ACCESS_TOKEN;
  if (wantsLive && !hasKey) return { mode: 'mock', model: 'mock', liveAvailable: false, accessTokenRequired, reason: 'LLM_MODE=live ですが OPENCODE_API_KEY が未設定のため mock で動作しています' };
  return wantsLive ? { mode: 'live', model, liveAvailable: true, accessTokenRequired } : { mode: 'mock', model: 'mock', liveAvailable: hasKey, accessTokenRequired };
}

// isolate 単位のベストエフォートなレート制限
const buckets = new Map<string, number[]>();
export function rateLimited(key: string, perMinute: number, now = Date.now()): boolean {
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < 60000);
  if (arr.length >= perMinute) {
    buckets.set(key, arr);
    return true;
  }
  arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > 5000) buckets.clear();
  return false;
}

export type DecideDeps = {
  env: ServerEnv;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  mockScenario?: MockScenario;
  accessToken?: string | null;
  now?: () => number;
};

export async function handleDecide(body: unknown, deps: DecideDeps): Promise<{ status: number; json: DecideResponse }> {
  const now = deps.now ?? (() => Date.now());
  const started = now();
  const modeInfo = resolveMode(deps.env);
  const parsed = ObservationInputSchema.safeParse(body);
  const requestId = (body as { requestId?: string } | null)?.requestId?.toString().slice(0, 80) ?? 'unknown';
  if (!parsed.success) {
    return { status: 400, json: { ok: false, requestId, source: modeInfo.mode, error: `invalid observation input: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, latencyMs: now() - started } };
  }
  const input = parsed.data;

  if (modeInfo.mode === 'live') {
    if (deps.env.DEMO_ACCESS_TOKEN && deps.accessToken !== deps.env.DEMO_ACCESS_TOKEN) {
      return { status: 401, json: { ok: false, requestId, source: 'live', error: 'access token required for live mode', latencyMs: now() - started } };
    }
    const limit = Number(deps.env.LLM_MAX_REQUESTS_PER_MINUTE || 20);
    if (rateLimited(input.sessionId, limit) || rateLimited('global', limit * 10)) {
      return { status: 429, json: { ok: false, requestId, source: 'live', error: 'rate limited', latencyMs: now() - started } };
    }
  }

  const generate =
    modeInfo.mode === 'live'
      ? liveGenerator(deps, modeInfo.model)
      : async (_turns: ChatTurn[]) => {
          if (deps.mockScenario === 'slow') await new Promise((r) => setTimeout(r, 2500));
          return JSON.stringify(mockDecide({ input, scenario: deps.mockScenario ?? 'default' }));
        };

  const turns: ChatTurn[] = [{ role: 'user', content: buildUserMessage(input) }];
  let attempts = 0;
  let lastError = '';
  while (attempts <= WIDGET_CONFIG.maxRepairAttempts) {
    attempts++;
    let text: string;
    try {
      text = await generate(turns);
    } catch (e) {
      const msg = (e as Error).name === 'AbortError' || (e as Error).name === 'TimeoutError' ? 'LLM request aborted or timed out' : String((e as Error).message).slice(0, 300);
      return { status: 502, json: { ok: false, requestId, source: modeInfo.mode, error: msg, latencyMs: now() - started } };
    }
    const result = validateOutput(text, input);
    if (result.ok) {
      return {
        status: 200,
        json: {
          ok: true,
          requestId: input.requestId,
          source: modeInfo.mode,
          model: modeInfo.model,
          latencyMs: now() - started,
          decision: result.decision,
          compiled: result.compiled,
          attempts,
          droppedEvidenceRefs: result.dropped,
        },
      };
    }
    lastError = result.error;
    // mock は修正版を持たないので再試行しない
    if (modeInfo.mode === 'mock') break;
    turns.push({ role: 'assistant', content: text.slice(0, 16000) }, { role: 'user', content: buildRepairMessage(result.error) });
  }
  return { status: 422, json: { ok: false, requestId, source: modeInfo.mode, error: `generation rejected: ${lastError}`, latencyMs: now() - started } };
}

function liveGenerator(deps: DecideDeps, model: string) {
  const cfg: LlmConfig = {
    apiKey: deps.env.OPENCODE_API_KEY!,
    baseUrl: deps.env.OPENCODE_BASE_URL || 'https://opencode.ai/inference',
    model,
    format: resolveFormat(model, deps.env.OPENCODE_API_FORMAT),
    timeoutMs: Number(deps.env.LLM_TIMEOUT_MS || 30000),
    // 既定は off（思考なし）。on にするとモデル既定の思考を使う（遅くなる）
    thinking: (deps.env.OPENCODE_THINKING || 'off').toLowerCase() === 'on',
  };
  return async (turns: ChatTurn[]) => (await callOpenCode(cfg, SYSTEM_PROMPT, turns, deps.signal, deps.fetchImpl)).text;
}

type ValidateResult =
  | { ok: true; decision: UiDecision; compiled?: { js: string; css: string }; dropped: string[] }
  | { ok: false; error: string };

export function validateOutput(text: string, input: ObservationInput): ValidateResult {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch (e) {
    return { ok: false, error: `output is not JSON: ${(e as Error).message}` };
  }
  // リビジョンと requestId はモデルの申告ではなく入力値で確定する
  if (raw && typeof raw === 'object') {
    Object.assign(raw, { requestId: input.requestId, basedOnStateRevision: input.stateRevision, basedOnUiRevision: input.uiRevision });
  }
  const parsed = UiDecisionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: `schema: ${parsed.error.issues.slice(0, 4).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  }
  const { decision, dropped } = filterEvidence(parsed.data, input);
  if (decision.action === 'upsert_widget') {
    const slots = input.currentUI.availableSlots.map((s) => s.slot);
    if (!slots.includes(decision.widget.slot)) return { ok: false, error: `slot "${decision.widget.slot}" is not available on this page (${slots.join(', ')})` };
    const existing = input.currentUI.widgets.some((w) => w.id === decision.widget.id);
    if (!existing && input.currentUI.widgets.length >= input.currentUI.maxActiveWidgets) {
      return { ok: false, error: `max ${input.currentUI.maxActiveWidgets} widgets; update or remove an existing one` };
    }
    const compiled = compileWidget(decision.widget.sourceTsx, decision.widget.css ?? '');
    if (!compiled.ok) return { ok: false, error: `${compiled.stage}: ${compiled.error}` };
    return { ok: true, decision, compiled: { js: compiled.js, css: compiled.css }, dropped };
  }
  if (decision.action === 'remove_widget' && !input.currentUI.widgets.some((w) => w.id === decision.widgetId)) {
    return { ok: false, error: `widget "${decision.widgetId}" does not exist` };
  }
  return { ok: true, decision, dropped };
}
