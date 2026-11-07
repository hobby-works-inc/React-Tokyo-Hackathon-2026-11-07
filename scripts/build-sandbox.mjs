// sandboxed iframe 内で動く固定ランタイム（React + 観測 + MessageChannel）をバンドルする
import { build } from 'esbuild';

await build({
  entryPoints: ['src/sandbox/runtime.tsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outfile: 'public/sandbox/runtime.js',
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none',
});
console.log('built public/sandbox/runtime.js');
