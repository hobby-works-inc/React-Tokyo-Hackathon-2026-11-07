'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useRouter } from 'waku';
import { DevPanel } from './DevPanel';
import { engine } from './engine';
import { OverlaySlot } from './GenSlot';
import { Reveal } from './Reveal';
import { actions, hydrateFromSession, store, useDemo, type PageId } from './store';

export function Shell({ children }: { children: ReactNode }) {
  const consented = useDemo((s) => s.consented);
  const revealOpen = useDemo((s) => s.revealOpen);
  const overlayOpen = useDemo((s) => s.widgets.some((w) => w.slot === 'overlay' && w.active));

  useEffect(() => {
    hydrateFromSession();
    document.documentElement.dataset.hydrated = '1';
    fetch('/mode')
      .then((r) => r.json())
      .then((info) => store.set({ server: info }))
      .catch(() => store.set({ server: { mode: 'mock', model: 'mock', liveAvailable: false, accessTokenRequired: false, reason: 'mode の取得に失敗' } }));
  }, []);

  useEffect(() => {
    // ホスト側モーダルで覆われた領域は表示時間に数えない
    engine.setHostModal(!consented || revealOpen || overlayOpen);
  }, [consented, revealOpen, overlayOpen]);

  return (
    <>
      <TrainingBanner />
      <Header />
      <LlmNotice />
      <main className="main">{children}</main>
      <footer className="footer">ポチモール（架空のECサイト）— ハッカソン用の訓練デモです。商品・価格・レビューはすべて架空です。</footer>
      <ControlBar />
      <OverlaySlot />
      {revealOpen ? <Reveal /> : null}
      {!consented ? <ConsentGate /> : null}
      <DevPanel />
    </>
  );
}

function TrainingBanner() {
  const server = useDemo((s) => s.server);
  const mode = useDemo((s) => s.mode);
  const finished = useDemo((s) => s.finished);
  return (
    <div className="training-banner" data-ai-ignore>
      <span>⚠ 訓練用デモ・実際の購入は発生しません</span>
      <span className={`badge ${server?.mode === 'live' ? 'badge-live' : 'badge-mock'}`} data-testid="llm-mode">
        {server ? (server.mode === 'live' ? `LIVE: ${server.model}` : 'MOCK（ルール生成・LLMなし）') : '…'}
      </span>
      <span className={`badge ${mode === 'defend' ? 'badge-defend' : 'badge-challenge'}`} data-testid="ui-mode">
        {mode === 'defend' ? '防御モード（安全なUI）' : '体験モード（誘導UI）'}
      </span>
      {finished ? <span className="badge">体験終了</span> : null}
    </div>
  );
}

function Header() {
  const auth = useDemo((s) => s.auth);
  const count = useDemo((s) => s.cart.reduce((n, l) => n + l.quantity, 0));
  return (
    <header className="header">
      <Link to="/" className="logo">
        ポチ<span>モール</span>
      </Link>
      <div className="search" aria-hidden>
        <input placeholder="検索（デモでは無効）" disabled />
      </div>
      <nav className="nav">
        {auth ? (
          <>
            <span className="hello">こんにちは、{auth.displayName}さん</span>
            <button className="linkish" data-action-id="logout" onClick={() => actions.logout()}>
              ログアウト
            </button>
          </>
        ) : (
          <>
            <Link to="/login">ログイン</Link>
            <Link to="/signup">新規登録</Link>
          </>
        )}
        <Link to="/cart" className="cart-link" data-action-id="header-cart">
          🛒 カート <b data-testid="cart-count">{count}</b>
        </Link>
      </nav>
    </header>
  );
}

function ControlBar() {
  const router = useRouter();
  const consented = useDemo((s) => s.consented);
  const inflight = useDemo((s) => s.inflight);
  if (!consented) return null;
  return (
    <div className="control-bar" data-ai-ignore>
      <span className="cb-title">デモ操作</span>
      <button data-testid="reveal" onClick={() => store.set({ revealOpen: true })}>
        種明かし
      </button>
      <button
        data-testid="finish"
        onClick={() => {
          engine.finish();
          router.push('/result');
        }}
      >
        体験を終了
      </button>
      <button
        data-testid="reset"
        onClick={() => {
          engine.reset();
          router.push('/');
        }}
      >
        リセット
      </button>
      <button data-testid="devpanel-toggle" onClick={() => store.set((s) => ({ devPanelOpen: !s.devPanelOpen }))}>
        開発者パネル
      </button>
      <span className={`cb-status ${inflight ? 'busy' : ''}`} data-testid="llm-status">
        {inflight ? 'AI判断中…' : '待機'}
      </span>
    </div>
  );
}

async function checkToken(token: string): Promise<boolean> {
  try {
    const r = await fetch('/mode', { headers: { 'x-demo-access-token': token } });
    const info = (await r.json()) as { tokenValid?: boolean };
    return info.tokenValid === true;
  } catch {
    return false;
  }
}

function ConsentGate() {
  const server = useDemo((s) => s.server);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const needsToken = server?.mode === 'live' && server.accessTokenRequired;
  return (
    <div className="modal-backdrop" data-ai-ignore>
      <div className="modal" role="dialog" aria-labelledby="consent-title">
        <h2 id="consent-title">体験を始める前に</h2>
        <p>これは「生成UIによる購買誘導」を体験するための訓練用デモです。実際の購入・決済・配送は発生しません。</p>
        <ul>
          <li>
            同意すると、このタブ内で <b>エリアごとの表示時間・カーソルの位置・スクロール・クリック</b> を集計し、AI に送ります。
          </li>
          <li>カメラや視線計測は使いません。フォームの入力値・キーストローク・パスワードは収集しません。</li>
          <li>AI はその情報をもとに、画面の一部に小さな UI を生成・更新します。最後に「種明かし」で仕組みを確認できます。</li>
          <li>課題: {`税込49,800円・送料無料のヘッドホンを、予算50,000円以内・追加保証なしで購入する`}</li>
        </ul>
        <p className="muted">
          AI: {server ? (server.mode === 'live' ? `LIVE（${server.model}）` : 'MOCK（手口の部品をルールで組み合わせて生成。LLM は使っていません）') : '確認中…'}
          {server?.reason ? `／${server.reason}` : ''}
        </p>
        {needsToken ? (
          <label className="field">
            合言葉（主催者から共有されたもの。AI の利用に必要です）
            <input value={token} onChange={(e) => { setToken(e.target.value); setError(null); }} type="password" autoComplete="off" data-testid="access-token" />
          </label>
        ) : null}
        {error ? <p className="ng small" data-testid="consent-error">{error}</p> : null}
        <div className="modal-actions">
          <button
            className="btn-primary"
            data-testid="consent-accept"
            disabled={!server || checking || (needsToken && token.trim() === '')}
            onClick={async () => {
              if (needsToken) {
                setChecking(true);
                const ok = await checkToken(token.trim());
                setChecking(false);
                if (!ok) {
                  setError('合言葉が違います。主催者に確認してください。');
                  return;
                }
              }
              store.set({ consented: true, accessToken: token.trim(), authError: null });
              engine.start();
            }}
          >
            {checking ? '確認中…' : '同意して体験を始める'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** live の合言葉エラーや一時的な AI エラーを画面に出す */
function LlmNotice() {
  const authError = useDemo((s) => s.authError);
  const notice = useDemo((s) => s.llmNotice);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!authError && !notice) return null;
  return (
    <div className="llm-notice" data-ai-ignore data-testid="llm-notice" role="alert">
      <span>{authError ?? notice}</span>
      {authError ? (
        <>
          <input type="password" placeholder="合言葉" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
          <button
            onClick={async () => {
              if (!(await checkToken(token.trim()))) {
                setError('合言葉が違います');
                return;
              }
              setError(null);
              store.set({ accessToken: token.trim(), authError: null });
              engine.stop();
              engine.start();
            }}
          >
            再開
          </button>
          {error ? <span className="ng">{error}</span> : null}
        </>
      ) : (
        <button onClick={() => store.set({ llmNotice: null })}>閉じる</button>
      )}
    </div>
  );
}

/** 各ページで呼ぶ。ページ遷移を状態リビジョンと観測に反映する */
export function usePage(id: PageId, productId?: string) {
  useEffect(() => {
    actions.setPage({ id, productId, path: window.location.pathname });
    engine.onPageChange();
  }, [id, productId]);
}
