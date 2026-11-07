import { resolveMode } from '../../lib/server/decide';
import { readEnv } from '../../lib/server/env';

export const GET = async (request: Request): Promise<Response> => {
  const env = readEnv();
  const info = resolveMode(env);
  // 合言葉の確認結果は真偽値だけ返す（値そのものは返さない）
  const token = request.headers.get('x-demo-access-token');
  const tokenValid = !info.accessTokenRequired || info.mode !== 'live' || (!!token && token === env.DEMO_ACCESS_TOKEN);
  return Response.json({ ...info, tokenValid }, { headers: { 'cache-control': 'no-store' } });
};
