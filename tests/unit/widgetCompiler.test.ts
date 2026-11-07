import { describe, expect, it } from 'vitest';
import { compileWidget } from '../../src/lib/widgetCompiler';
import { GOOD_TSX } from './fixtures';

describe('compileWidget', () => {
  it('正しい TSX をトランスパイルする', () => {
    const r = compileWidget(GOOD_TSX, '.root{color:red}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.js).toContain('exports.default');
  });
  it.each([
    ['fetch', `export default function W(){ fetch('/x'); return null }`],
    ['window', `export default function W(){ return <div>{window.name}</div> }`],
    ['parent', `export default function W(){ parent.postMessage(1,'*'); return null }`],
    ['eval', `export default function W(){ eval('1'); return null }`],
    ['constructor', `export default function W(){ const f = (()=>0).constructor; return null }`],
    ['computed constructor', `export default function W(){ const f = (()=>0)['constructor']; return null }`],
    ['dynamic import', `export default function W(){ import('x'); return null }`],
    ['other package', `import x from 'lodash'; export default function W(){ return null }`],
    ['dangerouslySetInnerHTML', `export default function W(){ return <div dangerouslySetInnerHTML={{__html:'x'}} /> }`],
    ['a href', `export default function W(){ return <a href="https://e.com">x</a> }`],
    ['img', `export default function W(){ return <img alt="" /> }`],
    ['setInterval', `export default function W(){ setInterval(()=>{},1); return null }`],
    ['globalThis shorthand', `export default function W(){ const o = { globalThis }; return null }`],
  ])('禁止: %s', (_n, src) => {
    expect(compileWidget(src).ok).toBe(false);
  });
  it('構文エラーを検出する', () => {
    const r = compileWidget('export default function W( { return <div> }');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.stage).toBe('syntax');
  });
  it('default export がないと拒否', () => {
    const r = compileWidget('export function W(){ return null }');
    expect(r.ok).toBe(false);
  });
  it('外部リソースを読む css を拒否', () => {
    expect(compileWidget(GOOD_TSX, '.a{background:url(https://e.com/x.png)}').ok).toBe(false);
    expect(compileWidget(GOOD_TSX, '@import "x.css";').ok).toBe(false);
  });
  it('プロパティ名としての location 等は許可（オブジェクトキー・メンバー名）', () => {
    expect(compileWidget(`export default function W({context}){ const o = { location: 1 }; return <div>{o.location}{context.document}</div> }`).ok).toBe(true);
  });
});
