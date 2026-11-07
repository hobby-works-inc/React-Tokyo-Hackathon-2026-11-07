// 生成 TSX の検証とトランスパイル。サーバー側で動くが、生成コードを「実行」はしない。
// sucrase で TSX → JS（CommonJS 形式）に変換し、acorn の AST で禁止 API と依存を検査する。
import { transform } from 'sucrase';
import { parse } from 'acorn';
import { simple as walkSimple, ancestor as walkAncestor } from 'acorn-walk';
import { WIDGET_CONFIG } from './config';

export type CompileResult =
  | { ok: true; js: string; css: string }
  | { ok: false; stage: 'size' | 'syntax' | 'forbidden' | 'dependency' | 'contract'; error: string };

/** 参照を禁止するグローバル識別子（CSP・sandbox と重ねた多層防御） */
export const FORBIDDEN_IDENTIFIERS = new Set([
  'window', 'self', 'globalThis', 'global', 'document', 'parent', 'top', 'opener', 'frames',
  'location', 'history', 'navigator', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource',
  'RTCPeerConnection', 'Worker', 'SharedWorker', 'ServiceWorker', 'importScripts', 'eval',
  'Function', 'AsyncFunction', 'localStorage', 'sessionStorage', 'indexedDB', 'caches',
  'cookieStore', 'postMessage', 'open', 'close', 'alert', 'confirm', 'prompt', 'Image',
  'Audio', 'Request', 'Response', 'Headers', 'FormData', 'BroadcastChannel', 'MessageChannel',
  'Reflect', 'Proxy', 'WebAssembly', 'process', 'Deno', 'Bun', 'crypto', 'setInterval',
]);

const FORBIDDEN_PROPERTIES = new Set([
  'constructor', '__proto__', 'prototype', 'innerHTML', 'outerHTML', 'insertAdjacentHTML',
  'srcdoc', 'contentWindow', 'ownerDocument', 'defaultView', 'sendBeacon', 'cookie',
]);

const FORBIDDEN_JSX_PROPS = ['dangerouslySetInnerHTML', 'formAction', 'href', 'src', 'action', 'srcSet', 'xlinkHref'];

/** sucrase が生成するヘルパーで使われる識別子 */
const ALLOWED_INJECTED = new Set(['require', 'exports', 'module', 'React']);

export function compileWidget(sourceTsx: string, css = ''): CompileResult {
  if (sourceTsx.length > WIDGET_CONFIG.maxSourceChars) {
    return { ok: false, stage: 'size', error: `source too large (${sourceTsx.length} chars)` };
  }
  if (css.length > WIDGET_CONFIG.maxCssChars) {
    return { ok: false, stage: 'size', error: 'css too large' };
  }
  const cssCheck = checkCss(css);
  if (cssCheck) return { ok: false, stage: 'forbidden', error: cssCheck };

  // JSX 属性レベルの禁止（リンク・外部リソース・HTML 直書き）
  for (const prop of FORBIDDEN_JSX_PROPS) {
    const re = new RegExp(`\\b${prop}\\s*=`, 'm');
    if (re.test(sourceTsx)) return { ok: false, stage: 'forbidden', error: `JSX prop "${prop}" is not allowed` };
  }
  if (/<\s*(a|form|iframe|script|link|img|video|audio|object|embed|meta|base|style)\b/i.test(sourceTsx)) {
    return { ok: false, stage: 'forbidden', error: 'element not allowed (a/form/iframe/script/link/img/video/audio/object/embed/meta/base/style)' };
  }

  // 型だけの import も含め、依存は react のみ（sucrase は未使用 import を消すため変換前に検査）
  const importRe = /^\s*(?:import\s+(?:type\s+)?(?:[\w*{}\s,$]+\s+from\s+)?|export\s+(?:type\s+)?[\w*{}\s,$]+\s+from\s+)['"]([^'"]+)['"]/gm;
  for (const m of sourceTsx.matchAll(importRe)) {
    if (m[1] !== 'react') return { ok: false, stage: 'dependency', error: `only "react" can be imported (got ${m[1]})` };
  }


  let js: string;
  try {
    js = transform(sourceTsx, {
      transforms: ['typescript', 'jsx', 'imports'],
      jsxRuntime: 'classic',
      production: true,
      filePath: 'widget.tsx',
    }).code;
  } catch (e) {
    return { ok: false, stage: 'syntax', error: String((e as Error).message).slice(0, 300) };
  }

  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(js, { ecmaVersion: 2022, sourceType: 'script' });
  } catch (e) {
    return { ok: false, stage: 'syntax', error: String((e as Error).message).slice(0, 300) };
  }

  const problems: Array<{ stage: 'forbidden' | 'dependency'; msg: string }> = [];
  const hasDefaultExport = /exports\.default\s*=/.test(js);

  walkSimple(ast, {
    ImportExpression() {
      problems.push({ stage: 'forbidden', msg: 'dynamic import() is not allowed' });
    },
    CallExpression(node: any) {
      if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
        const arg = node.arguments[0];
        if (!arg || arg.type !== 'Literal' || arg.value !== 'react') {
          problems.push({ stage: 'dependency', msg: `only "react" can be imported (got ${arg?.value ?? 'non-literal'})` });
        }
      }
    },
    MemberExpression(node: any) {
      const name = !node.computed && node.property.type === 'Identifier' ? node.property.name : node.property.type === 'Literal' ? String(node.property.value) : null;
      if (name && FORBIDDEN_PROPERTIES.has(name)) problems.push({ stage: 'forbidden', msg: `property "${name}" is not allowed` });
      if (node.computed && node.property.type !== 'Literal' && node.object.type === 'Identifier' && FORBIDDEN_IDENTIFIERS.has(node.object.name)) {
        problems.push({ stage: 'forbidden', msg: 'computed access on forbidden global' });
      }
    },
    TaggedTemplateExpression() {
      // tagged template は許可しても問題は少ないが、検査を単純にするため禁止
      problems.push({ stage: 'forbidden', msg: 'tagged templates are not allowed' });
    },
  });

  // 識別子参照（宣言・プロパティキーを除く）の検査
  walkAncestor(ast, {
    Identifier(node: any, _state: unknown, ancestors: any[]) {
      const parentNode = ancestors[ancestors.length - 2];
      if (!parentNode) return;
      if (parentNode.type === 'MemberExpression' && parentNode.property === node && !parentNode.computed) return;
      if ((parentNode.type === 'Property' || parentNode.type === 'MethodDefinition') && parentNode.key === node && !parentNode.computed) {
        // shorthand { window } は値として参照するので検査対象
        if (!(parentNode.shorthand && parentNode.value === node)) return;
      }
      if (ALLOWED_INJECTED.has(node.name)) return;
      if (FORBIDDEN_IDENTIFIERS.has(node.name)) {
        problems.push({ stage: 'forbidden', msg: `"${node.name}" is not allowed` });
      }
    },
  });

  if (problems.length > 0) {
    const first = problems[0]!;
    return { ok: false, stage: first.stage, error: [...new Set(problems.map((p) => p.msg))].slice(0, 5).join('; ') };
  }
  if (!hasDefaultExport) {
    return { ok: false, stage: 'contract', error: 'widget must `export default function GeneratedWidget({ context, emit })`' };
  }
  return { ok: true, js, css };
}

// グローバル名と同じ名前のローカル宣言（const open = ...）も安全側に倒して禁止している

function checkCss(css: string): string | null {
  if (!css) return null;
  if (/@import|url\s*\(|expression\s*\(|behavior\s*:|-moz-binding|image-set\s*\(/i.test(css)) {
    return 'css may not load external resources (@import/url()/image-set)';
  }
  if (/position\s*:\s*fixed/i.test(css)) {
    return 'position: fixed is not allowed in widget css';
  }
  return null;
}
