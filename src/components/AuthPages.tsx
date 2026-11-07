'use client';
// 固定のダミー認証。本物の認証・アクセス制御ではない。
// パスワードは保存・ログ出力・LLM 送信をしない（フォームの state にだけ一時的に存在する）。
import { useState } from 'react';
import { Link, useRouter } from 'waku';
import { engine } from './engine';
import { usePage } from './Shell';
import { actions } from './store';

function DemoNotice() {
  return <p className="notice">デモ用です。実際のメールアドレス・パスワードを入力しないでください。どんな値でもログインできます。</p>;
}

export function LoginPage() {
  usePage('other');
  const router = useRouter();
  const [ident, setIdent] = useState('');
  const [pw, setPw] = useState('');
  return (
    <div className="auth">
      <h1 className="page-title">ログイン</h1>
      <DemoNotice />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          actions.login(ident.trim() || 'ゲスト');
          setPw('');
          engine.track('login', { actionId: 'login-submit' });
          router.push('/');
        }}
      >
        <label className="field">
          ID またはメール（ダミー）
          <input value={ident} onChange={(e) => setIdent(e.target.value)} autoComplete="off" data-testid="login-id" />
        </label>
        <label className="field">
          パスワード（ダミー）
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" data-testid="login-pw" />
        </label>
        <div className="row-actions">
          <button type="button" className="btn-secondary" data-testid="login-fill" onClick={() => { setIdent('demo-user'); setPw('demo-pass-1234'); }}>
            ダミー入力をセット
          </button>
          <button type="submit" className="btn-primary" data-testid="login-submit">
            ログイン
          </button>
        </div>
      </form>
      <p className="small">
        アカウントがない場合は <Link to="/signup">新規登録</Link>
      </p>
    </div>
  );
}

export function SignupPage() {
  usePage('other');
  const router = useRouter();
  const [name, setName] = useState('');
  const [ident, setIdent] = useState('');
  const [pw, setPw] = useState('');
  return (
    <div className="auth">
      <h1 className="page-title">新規登録</h1>
      <DemoNotice />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // 登録後はそのままログイン済み。メール確認・形式チェック・既存アカウント照合はしない
          actions.login(name.trim() || ident.trim() || 'ゲスト');
          setPw('');
          engine.track('signup', { actionId: 'signup-submit' });
          router.push('/');
        }}
      >
        <label className="field">
          表示名
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" data-testid="signup-name" />
        </label>
        <label className="field">
          ID またはメール（ダミー・形式自由）
          <input value={ident} onChange={(e) => setIdent(e.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          パスワード（ダミー）
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" data-testid="signup-pw" />
        </label>
        <div className="row-actions">
          <button type="button" className="btn-secondary" data-testid="signup-fill" onClick={() => { setName('デモ太郎'); setIdent('demo-taro'); setPw('demo-pass-5678'); }}>
            ダミー入力をセット
          </button>
          <button type="submit" className="btn-primary" data-testid="signup-submit">
            登録してログイン
          </button>
        </div>
      </form>
    </div>
  );
}
