// OpenCode Console Inference API クライアント。
// 仕様: https://opencode.ai/docs/console/api/inference/
//   Authorization: Bearer <OPENCODE_API_KEY>
//   OpenAI Chat Completions: {base}/openai/v1/chat/completions
//   Anthropic Messages:      {base}/anthropic/v1/messages（max_tokens 必須）

export type LlmConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  format: 'anthropic' | 'openai-chat';
  timeoutMs: number;
  /** false で Claude の拡張思考を切る（出力トークンが減り応答が速くなる） */
  thinking?: boolean;
};

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export function resolveFormat(model: string, configured: string | undefined): 'anthropic' | 'openai-chat' {
  if (configured === 'anthropic' || configured === 'openai-chat') return configured;
  return /^(claude|qwen)/i.test(model) ? 'anthropic' : 'openai-chat';
}

/**
 * 思考を切るための thinking パラメータ。モデルにより受け付ける値が違う:
 * Haiku 系は {type:"disabled"}、Sonnet/Opus 5.5 系は {type:"between_tools"} を要求する。
 */
export function thinkingOffParam(model: string): { type: 'disabled' | 'between_tools' } | undefined {
  if (!/^claude/i.test(model)) return undefined;
  return /haiku/i.test(model) ? { type: 'disabled' } : { type: 'between_tools' };
}

export async function callOpenCode(
  cfg: LlmConfig,
  system: string,
  turns: ChatTurn[],
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<{ text: string; usage?: unknown }> {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const timeout = AbortSignal.timeout(cfg.timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const headers = {
    Authorization: `Bearer ${cfg.apiKey}`,
    'Content-Type': 'application/json',
  };
  if (cfg.format === 'anthropic') {
    const thinking = cfg.thinking === false ? thinkingOffParam(cfg.model) : undefined;
    const post = (withThinking: boolean) =>
      fetchImpl(`${base}/anthropic/v1/messages`, {
        method: 'POST',
        headers,
        signal: combined,
        body: JSON.stringify({ model: cfg.model, max_tokens: 4096, system, messages: turns, ...(withThinking && thinking ? { thinking } : {}) }),
      });
    let res = await post(true);
    // モデルが thinking の指定を受け付けない場合は、指定なしで1回だけやり直す
    if (thinking && res.status === 400) {
      const err = await safeText(res);
      if (!/thinking/i.test(err)) throw new Error(`OpenCode API 400: ${err.slice(0, 300)}`);
      res = await post(false);
    }
    if (!res.ok) throw new Error(`OpenCode API ${res.status}: ${(await safeText(res)).slice(0, 300)}`);
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }>; usage?: unknown };
    const text = (json.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
    return { text, usage: json.usage };
  }
  const res = await fetchImpl(`${base}/openai/v1/chat/completions`, {
    method: 'POST',
    headers,
    signal: combined,
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'system', content: system }, ...turns],
      max_tokens: 4096,
    }),
  });
  if (!res.ok) throw new Error(`OpenCode API ${res.status}: ${(await safeText(res)).slice(0, 300)}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
  return { text: json.choices?.[0]?.message?.content ?? '', usage: json.usage };
}

async function safeText(res: Response) {
  try {
    // API キーがエラー本文に含まれても外へ出さない
    return (await res.text()).replace(/oc_sk_[A-Za-z0-9_]+/g, 'oc_sk_***');
  } catch {
    return '';
  }
}
