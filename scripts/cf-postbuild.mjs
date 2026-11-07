// waku の Cloudflare ビルドが生成する dist/server/wrangler.json には vars が入らないため、
// ルートの wrangler.jsonc の vars をマージする。シークレットは扱わない。
import fs from 'node:fs';

const root = fs.readFileSync('wrangler.jsonc', 'utf8')
  .replace(/^\s*\/\/.*$/gm, '');
const rootConfig = JSON.parse(root);
const target = 'dist/server/wrangler.json';
const config = JSON.parse(fs.readFileSync(target, 'utf8'));
config.vars = { ...(config.vars ?? {}), ...(rootConfig.vars ?? {}) };
for (const secret of ['OPENCODE_API_KEY', 'DEMO_ACCESS_TOKEN']) {
  if (secret in config.vars) {
    throw new Error(`${secret} must be a secret, not a var`);
  }
}
fs.writeFileSync(target, JSON.stringify(config, null, 2) + '\n');
console.log(`merged vars into ${target}:`, Object.keys(config.vars).join(', '));
