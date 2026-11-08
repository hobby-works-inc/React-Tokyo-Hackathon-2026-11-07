import { describe, expect, it } from 'vitest';
import { handleDecide, resolveMode, validateOutput } from '../../src/lib/server/decide';
import { resolveFormat, thinkingOffParam } from '../../src/lib/server/opencode';
import { mockDecide } from '../../src/lib/server/mock';
import { compileWidget } from '../../src/lib/widgetCompiler';
import { GOOD_TSX, makeInput } from './fixtures';

const decisionJson = (over: object = {}) =>
  JSON.stringify({
    requestId: 'whatever', basedOnStateRevision: 0, basedOnUiRevision: 0,
    observationSummary: 's', hypotheses: [{ text: 'h', evidenceRefs: ['e1', 'region:price.cursorDwellMs', 'e999'], certainty: 'high' }], explanation: 'x',
    action: 'upsert_widget', tactic: 't', widget: { id: 'price-banner', slot: 'near_price', sourceTsx: GOOD_TSX },
    ...over,
  });

describe('validateOutput（出力スキーマ）', () => {
  it('requestId とリビジョンは入力値で上書きし、存在しない根拠参照を除く', () => {
    const r = validateOutput(decisionJson(), makeInput());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.decision.requestId).toBe('r1');
    expect(r.decision.basedOnStateRevision).toBe(3);
    expect(r.dropped).toEqual(['e999']);
    expect(r.decision.hypotheses[0]!.evidenceRefs).toEqual(['e1', 'region:price.cursorDwellMs']);
    expect(r.compiled?.js).toContain('exports.default');
  });
  it('コードフェンス付きでも JSON を取り出す', () => {
    expect(validateOutput('```json\n' + decisionJson({ action: 'noop' }) + '\n```', makeInput()).ok).toBe(true);
  });
  it('ページにないスロットを拒否', () => {
    const r = validateOutput(decisionJson({ widget: { id: 'a-b', slot: 'cart_summary', sourceTsx: GOOD_TSX } }), makeInput());
    expect(r.ok).toBe(false);
  });
  it('不正なアクション・不正なウィジェットIDを拒否', () => {
    expect(validateOutput(decisionJson({ action: 'buy_now' }), makeInput()).ok).toBe(false);
    expect(validateOutput(decisionJson({ widget: { id: '../x', slot: 'near_price', sourceTsx: GOOD_TSX } }), makeInput()).ok).toBe(false);
  });
  it('存在しないウィジェットの削除を拒否', () => {
    expect(validateOutput(decisionJson({ action: 'remove_widget', widgetId: 'nope' }), makeInput()).ok).toBe(false);
  });
  it('上限数を超える新規追加を拒否', () => {
    const w = (id: string) => ({ id, slot: 'near_price' as const, version: 1, tactic: 't', mountedOnPage: true, sourceTsx: '', sourceTruncated: false });
    const input = makeInput({ currentUI: { ...makeInput().currentUI, widgets: [w('a1'), w('a2'), w('a3')] } });
    expect(validateOutput(decisionJson(), input).ok).toBe(false);
  });
});

describe('handleDecide', () => {
  it('不正な入力を 400 で拒否', async () => {
    const r = await handleDecide({ hello: 1 }, { env: {} });
    expect(r.status).toBe(400);
  });
  it('mock モードで保存済みレスポンスを返し、source=mock を明示する', async () => {
    const r = await handleDecide(makeInput(), { env: { LLM_MODE: 'mock' } });
    expect(r.status).toBe(200);
    expect(r.json.ok && r.json.source).toBe('mock');
  });
  it('live + 不正コード → 1回だけ修正を依頼し、それでも駄目なら 422', async () => {
    let calls = 0;
    const bad = decisionJson({ widget: { id: 'x-y', slot: 'near_price', sourceTsx: `export default function W(){ fetch('/'); return null }` } });
    const fetchImpl = (async () => {
      calls++;
      return new Response(JSON.stringify({ content: [{ type: 'text', text: bad }] }), { status: 200 });
    }) as typeof fetch;
    const r = await handleDecide(makeInput({ sessionId: 'live-1' }), { env: { LLM_MODE: 'live', OPENCODE_API_KEY: 'k', OPENCODE_MODEL: 'claude-sonnet-5-5' }, fetchImpl });
    expect(calls).toBe(2);
    expect(r.status).toBe(422);
  });
  it('live: 修正後の出力が正しければ成功（試行2回）。OpenCode の Messages API を Bearer で呼ぶ', async () => {
    const seen: Array<{ url: string; auth: string | null; body: any }> = [];
    let n = 0;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, auth: new Headers(init.headers).get('authorization'), body: JSON.parse(String(init.body)) });
      const text = n++ === 0 ? 'not json' : decisionJson({ action: 'noop' });
      return new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await handleDecide(makeInput({ sessionId: 'live-2' }), { env: { LLM_MODE: 'live', OPENCODE_API_KEY: 'oc_sk_test', OPENCODE_BASE_URL: 'https://opencode.ai/inference/', OPENCODE_MODEL: 'claude-sonnet-5-5' }, fetchImpl });
    expect(r.status).toBe(200);
    expect(r.json.ok && r.json.attempts).toBe(2);
    expect(seen[0]!.url).toBe('https://opencode.ai/inference/anthropic/v1/messages');
    expect(seen[0]!.auth).toBe('Bearer oc_sk_test');
    expect(seen[0]!.body.max_tokens).toBeGreaterThan(0);
    expect(seen[1]!.body.messages).toHaveLength(3);
    // 既定では思考を切る（Sonnet 5.5 は between_tools）
    expect(seen[0]!.body.thinking).toEqual({ type: 'between_tools' });
  });
  it('live: thinking 指定を拒否されたら指定なしで1回だけやり直す', async () => {
    const bodies: any[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      bodies.push(body);
      if (body.thinking) return new Response('{"error":{"message":"thinking.type is not supported"}}', { status: 400 });
      return new Response(JSON.stringify({ content: [{ type: 'text', text: decisionJson({ action: 'noop' }) }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await handleDecide(makeInput({ sessionId: 'live-think' }), { env: { LLM_MODE: 'live', OPENCODE_API_KEY: 'k', OPENCODE_MODEL: 'claude-haiku-5-5' }, fetchImpl });
    expect(r.status).toBe(200);
    expect(bodies.map((b) => b.thinking)).toEqual([{ type: 'disabled' }, undefined]);
  });
  it('live: OPENCODE_THINKING=on なら thinking を送らない', async () => {
    let body: any;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ content: [{ type: 'text', text: decisionJson({ action: 'noop' }) }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await handleDecide(makeInput({ sessionId: 'live-think-on' }), { env: { LLM_MODE: 'live', OPENCODE_API_KEY: 'k', OPENCODE_THINKING: 'on' }, fetchImpl });
    expect(body.thinking).toBeUndefined();
  });
  it('live: chat completions 形式', async () => {
    let url = '';
    const fetchImpl = (async (u: string) => {
      url = u;
      return new Response(JSON.stringify({ choices: [{ message: { content: decisionJson({ action: 'noop' }) } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await handleDecide(makeInput({ sessionId: 'live-3' }), { env: { LLM_MODE: 'live', OPENCODE_API_KEY: 'k', OPENCODE_MODEL: 'glm-5.3' }, fetchImpl });
    expect(r.status).toBe(200);
    expect(url).toBe('https://opencode.ai/inference/openai/v1/chat/completions');
  });
  it('live: DEMO_ACCESS_TOKEN が設定されていればトークンなしは 401', async () => {
    const r = await handleDecide(makeInput(), { env: { LLM_MODE: 'live', OPENCODE_API_KEY: 'k', DEMO_ACCESS_TOKEN: 'secret' }, accessToken: null });
    expect(r.status).toBe(401);
  });
  it('live: レート制限', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ content: [{ type: 'text', text: decisionJson({ action: 'noop' }) }] }))) as unknown as typeof fetch;
    const env = { LLM_MODE: 'live', OPENCODE_API_KEY: 'k', LLM_MAX_REQUESTS_PER_MINUTE: '2' };
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await handleDecide(makeInput({ sessionId: 'rl' }), { env, fetchImpl })).status);
    expect(statuses).toEqual([200, 200, 429]);
  });
  it('API エラー本文に含まれたキーを伏せる', async () => {
    const fetchImpl = (async () => new Response('bad key oc_sk_abcdef123', { status: 401 })) as unknown as typeof fetch;
    const r = await handleDecide(makeInput({ sessionId: 'err' }), { env: { LLM_MODE: 'live', OPENCODE_API_KEY: 'k' }, fetchImpl });
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.json)).not.toContain('oc_sk_abcdef123');
  });
});

describe('設定', () => {
  it('LLM_MODE=live でもキーがなければ mock（理由つき）', () => {
    const m = resolveMode({ LLM_MODE: 'live' });
    expect(m.mode).toBe('mock');
    expect(m.reason).toBeTruthy();
  });
  it('API 形式の自動判定', () => {
    expect(resolveFormat('claude-sonnet-5-5', 'auto')).toBe('anthropic');
    expect(resolveFormat('kimi-k3', undefined)).toBe('openai-chat');
    expect(resolveFormat('kimi-k3', 'anthropic')).toBe('anthropic');
  });
  it('思考オフの指定値はモデルで変わる', () => {
    expect(thinkingOffParam('claude-haiku-5-5')).toEqual({ type: 'disabled' });
    expect(thinkingOffParam('claude-sonnet-5-5')).toEqual({ type: 'between_tools' });
    expect(thinkingOffParam('gemini-3.8-flash')).toBeUndefined();
  });
});

describe('mock の保存済みコードは検証を通る', () => {
  it('classic: challenge / defend の各ウィジェット', () => {
    const inputs = [
      makeInput(),
      makeInput({ recentEvents: [{ id: 'e1', atMs: 1, type: 'cart_add', isNew: true }] }),
      makeInput({ pageId: 'cart', currentUI: { ...makeInput().currentUI, availableSlots: [{ slot: 'cart_summary', description: '' }] }, scenario: { ...makeInput().scenario, cart: { lines: [{ productId: 'aurora-nc700', name: 'A', quantity: 1, optionIds: [], lineTotalYen: 49800 }], totalYen: 49800, shippingYen: 0 } } }),
    ];
    for (const id of ['price-limited', 'warranty-nudge', 'cart-compare'] as const) {
      const slot = id === 'cart-compare' ? 'cart_summary' : id === 'price-limited' ? 'near_price' : 'near_purchase';
      inputs.push(makeInput({ mode: 'defend', currentUI: { ...makeInput().currentUI, availableSlots: [{ slot, description: '' }], widgets: [{ id, slot, version: 1, tactic: 't', mountedOnPage: true, sourceTsx: '', sourceTruncated: false }] } }));
    }
    let upserts = 0;
    for (const input of inputs) {
      const d = mockDecide({ input, scenario: 'classic' });
      if (d.action === 'upsert_widget') {
        upserts++;
        const r = compileWidget(d.widget.sourceTsx, d.widget.css);
        expect(r.ok, `${d.widget.id}: ${!r.ok ? r.error : ''}`).toBe(true);
      }
    }
    expect(upserts).toBe(6);
  });
  it('broken シナリオのコードは検証で拒否される', async () => {
    const r = await handleDecide(makeInput(), { env: {}, mockScenario: 'broken' });
    expect(r.status).toBe(422);
  });
});
