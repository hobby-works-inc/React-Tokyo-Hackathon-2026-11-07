import { resolveMode } from '../../lib/server/decide';
import { readEnv } from '../../lib/server/env';

export const GET = async (): Promise<Response> => {
  const info = resolveMode(readEnv());
  return Response.json(info, { headers: { 'cache-control': 'no-store' } });
};
