import { getEnv } from 'waku';
import type { ServerEnv } from './decide';

const ENV_KEYS = ['LLM_MODE', 'OPENCODE_API_KEY', 'OPENCODE_BASE_URL', 'OPENCODE_MODEL', 'OPENCODE_API_FORMAT', 'LLM_TIMEOUT_MS', 'OPENCODE_THINKING', 'LLM_MAX_REQUESTS_PER_MINUTE', 'DEMO_ACCESS_TOKEN'] as const;

/** サーバー側だけで読む。クライアントへは渡さない */
export function readEnv(): ServerEnv {
  const env: ServerEnv = {};
  for (const k of ENV_KEYS) {
    const v = getEnv(k);
    if (v) env[k] = v;
  }
  return env;
}
