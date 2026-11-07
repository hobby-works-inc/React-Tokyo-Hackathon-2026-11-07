import { handleDecide } from '../../lib/server/decide';
import { readEnv } from '../../lib/server/env';
import type { MockScenario } from '../../lib/server/mock';

const MAX_BODY = 200_000;

export const POST = async (request: Request): Promise<Response> => {
  const text = await request.text();
  if (text.length > MAX_BODY) return Response.json({ ok: false, error: 'payload too large' }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  const scenarioHeader = request.headers.get('x-mock-scenario');
  const known: MockScenario[] = ['broken', 'runtime_error', 'slow', 'auto_option', 'infinite_loop'];
  const mockScenario: MockScenario = known.includes(scenarioHeader as MockScenario) ? (scenarioHeader as MockScenario) : 'default';
  const { status, json } = await handleDecide(body, {
    env: readEnv(),
    signal: request.signal,
    mockScenario,
    accessToken: request.headers.get('x-demo-access-token'),
  });
  // 観測データやパスワードはログに出さない（そもそもパスワードは送られてこない）
  console.log(`[decide] ${json.requestId} ${json.source} status=${status} ${json.ok ? json.decision.action : 'error'} ${json.latencyMs}ms`);
  return Response.json(json, { status, headers: { 'cache-control': 'no-store' } });
};
