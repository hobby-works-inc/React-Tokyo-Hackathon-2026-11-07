'use client';
import { useState } from 'react';
import { Link, useRouter } from 'waku';
import { MAX_QUANTITY, PRODUCTS, SCENARIO, calcCart, getProduct, judgeChallenge, yen } from '../lib/scenario';
import { engine } from './engine';
import { GenSlot } from './GenSlot';
import { usePage } from './Shell';
import { actions, store, useDemo } from './store';

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span className="stars" aria-label={`5段階中${rating}`}>
      {'★'.repeat(full)}
      {'☆'.repeat(5 - full)}
    </span>
  );
}

export function ProductList() {
  usePage('list');
  return (
    <div>
      <h1 className="page-title">おすすめのオーディオ</h1>
      <div className="grid">
        {PRODUCTS.map((p) => (
          <Link key={p.id} to={`/products/${p.id}`} className="card" data-action-id={`list-${p.id}`}>
            <img src={p.image} alt="" className="card-img" />
            <div className="card-name">{p.name}</div>
            <div>
              <Stars rating={p.rating} /> <span className="muted">{p.reviewCount.toLocaleString()}</span>
            </div>
            <div className="price">{yen(p.priceYen)}</div>
            <div className="muted small">{p.shippingNote}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ProductDetail({ id }: { id: string }) {
  usePage('product', id);
  const p = getProduct(id);
  const [qty, setQty] = useState(1);
  const selected = useDemo((s) => s.pendingOptions[id] ?? []);
  const inCart = useDemo((s) => s.cart.some((l) => l.productId === id));
  const [added, setAdded] = useState(false);
  if (!p) return <p>商品が見つかりません。</p>;
  const optYen = p.options.filter((o) => selected.includes(o.id)).reduce((n, o) => n + o.priceYen, 0);

  return (
    <div className="detail">
      <div className="detail-img" data-ai-region="image" data-ai-label="商品画像">
        <img src={p.image} alt={p.name} />
      </div>
      <div className="detail-main">
        <div className="muted small">{p.brand}</div>
        <h1 className="detail-title" data-ai-region="title" data-ai-label="商品名">
          {p.name}
        </h1>
        <div data-ai-region="rating" data-ai-label="評価">
          <Stars rating={p.rating} /> {p.rating} <span className="muted">（{p.reviewCount.toLocaleString()}件の評価）</span>
        </div>
        <hr />
        <div data-ai-region="price" data-ai-label="価格" className="price-block">
          <div className="price big" data-testid="base-price">
            {yen(p.priceYen)}
          </div>
          <div className="muted small">税込</div>
        </div>
        <GenSlot slot="near_price" />
        <div data-ai-region="description" data-ai-label="商品説明" className="desc">
          <h3>この商品について</h3>
          <ul>
            {p.description.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
        <div data-ai-region="reviews" data-ai-label="レビュー" className="reviews">
          <h3>カスタマーレビュー</h3>
          {p.reviews.map((r) => (
            <div key={r.title} className="review">
              <Stars rating={r.rating} /> <b>{r.title}</b>
              <div className="small muted">{r.author}</div>
              <p>{r.body}</p>
            </div>
          ))}
        </div>
      </div>
      <aside className="buybox">
        <div data-ai-region="shipping" data-ai-label="配送情報" className="shipping">
          <div className="price">{yen(p.priceYen)}</div>
          <div>
            <b>{p.shippingNote}</b>
          </div>
          <div className="small">{p.deliveryEstimate}</div>
          <div className="small muted">お届け先: デモ用住所（模擬）</div>
        </div>
        <GenSlot slot="near_shipping" />
        <div data-ai-region="purchase" data-ai-label="購入欄" className="purchase">
          <div className="stock">在庫あり（模擬）</div>
          <label className="small">
            数量{' '}
            <select
              value={qty}
              data-action-id="detail-qty"
              onChange={(e) => {
                setQty(Number(e.target.value));
                engine.track('quantity_change', { regionId: 'purchase', actionId: 'detail-qty', value: Number(e.target.value) });
              }}
            >
              {Array.from({ length: MAX_QUANTITY }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {p.options.map((o) => (
            <label key={o.id} className="option-row">
              <input
                type="checkbox"
                data-action-id={`option-${o.id}`}
                data-testid={`option-${o.id}`}
                checked={selected.includes(o.id)}
                onChange={(e) => {
                  actions.setOption(p.id, o.id, e.target.checked);
                  engine.track('option_toggle', { regionId: 'purchase', actionId: `option-${o.id}`, value: e.target.checked, major: true });
                }}
              />
              <span>
                {o.label}（+{yen(o.priceYen)}）<br />
                <span className="small muted">{o.description}</span>
              </span>
            </label>
          ))}
          <div className="small">
            小計: <b data-testid="detail-subtotal">{yen((p.priceYen + optYen) * qty + p.shippingYen)}</b>
          </div>
          <button
            className="btn-cart"
            data-action-id="add-to-cart"
            data-testid="add-to-cart"
            onClick={() => {
              actions.addToCart(p.id, qty);
              setAdded(true);
              engine.track('cart_add', { regionId: 'purchase', actionId: 'add-to-cart', value: qty, major: true });
            }}
          >
            カートに追加
          </button>
          {added || inCart ? (
            <div className="small ok">
              カートに入っています。<Link to="/cart">カートを見る</Link>
            </div>
          ) : null}
        </div>
        <GenSlot slot="near_purchase" />
      </aside>
    </div>
  );
}

export function CartPage() {
  usePage('cart');
  const router = useRouter();
  const cart = useDemo((s) => s.cart);
  const price = calcCart(cart);
  return (
    <div className="cart">
      <div className="cart-lines">
        <h1 className="page-title">ショッピングカート</h1>
        {price.lines.length === 0 ? (
          <p>
            カートは空です。<Link to="/">買い物を続ける</Link>
          </p>
        ) : null}
        {price.lines.map((l) => {
          const p = getProduct(l.productId)!;
          const line = cart.find((c) => c.productId === l.productId)!;
          return (
            <div key={l.productId} className="cart-line" data-ai-region={`cart_line:${l.productId}`} data-ai-label={`カート行(${p.name.slice(0, 12)})`}>
              <img src={p.image} alt="" />
              <div className="cart-line-main">
                <div className="card-name">{p.name}</div>
                <div className="small">{p.shippingNote}</div>
                <label className="small">
                  数量{' '}
                  <select
                    value={l.quantity}
                    data-action-id="cart-qty"
                    onChange={(e) => {
                      actions.setQuantity(p.id, Number(e.target.value));
                      engine.track('quantity_change', { actionId: 'cart-qty', value: Number(e.target.value), major: true });
                    }}
                  >
                    {Array.from({ length: MAX_QUANTITY }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>{' '}
                <button
                  className="linkish"
                  data-action-id="cart-remove"
                  onClick={() => {
                    actions.removeFromCart(p.id);
                    engine.track('cart_remove', { actionId: 'cart-remove', major: true });
                  }}
                >
                  削除
                </button>
                {p.options.map((o) => (
                  <label key={o.id} className="option-row small">
                    <input
                      type="checkbox"
                      data-action-id={`cart-option-${o.id}`}
                      data-testid={`cart-option-${o.id}`}
                      checked={line.optionIds.includes(o.id)}
                      onChange={(e) => {
                        actions.setOption(p.id, o.id, e.target.checked);
                        engine.track('option_toggle', { actionId: `cart-option-${o.id}`, value: e.target.checked, major: true });
                      }}
                    />
                    {o.label}（+{yen(o.priceYen)}）
                  </label>
                ))}
              </div>
              <div className="price">{yen(l.lineTotalYen)}</div>
            </div>
          );
        })}
      </div>
      <aside className="cart-summary">
        <div data-ai-region="cart_summary" data-ai-label="カート合計">
          <div>
            小計（{price.lines.reduce((n, l) => n + l.quantity, 0)}点）: {yen(price.itemsYen)}
          </div>
          <div>送料: {price.shippingYen === 0 ? '無料' : yen(price.shippingYen)}</div>
          <div className="total">
            合計: <b data-testid="cart-total">{yen(price.totalYen)}</b>
          </div>
          <div className="small muted">予算: {yen(SCENARIO.budgetYen)}</div>
          <button
            className="btn-buy"
            data-action-id="checkout"
            data-testid="checkout"
            disabled={price.lines.length === 0}
            onClick={() => {
              engine.track('checkout', { actionId: 'checkout', value: price.totalYen, major: false });
              actions.placeOrder();
              router.push('/order-complete');
            }}
          >
            注文を確定する（模擬）
          </button>
          <div className="small muted">実際の決済・配送は発生しません。</div>
        </div>
        <GenSlot slot="cart_summary" />
      </aside>
    </div>
  );
}

export function OrderComplete() {
  usePage('other');
  const order = useDemo((s) => s.order);
  if (!order) {
    return (
      <p>
        注文はまだありません。<Link to="/">トップへ</Link>
      </p>
    );
  }
  const price = calcCart(order.lines);
  return (
    <div className="panel">
      <h1 className="page-title">ご注文ありがとうございました（模擬）</h1>
      <p>実際の決済・配送は発生しません。</p>
      <ul>
        {price.lines.map((l) => (
          <li key={l.productId}>
            {l.name} × {l.quantity} {l.options.length ? `＋ ${l.options.map((o) => o.label).join('、')}` : ''} — {yen(l.lineTotalYen)}
          </li>
        ))}
      </ul>
      <p>
        合計: <b data-testid="order-total">{yen(price.totalYen)}</b>
      </p>
      <Link to="/result" className="btn-primary" data-testid="go-result">
        体験結果を見る
      </Link>
    </div>
  );
}

export function ResultPage() {
  usePage('other');
  const order = useDemo((s) => s.order);
  const interventions = useDemo((s) => s.interventions.filter((i) => i.action !== 'noop'));
  const r = judgeChallenge(order);
  return (
    <div className="panel">
      <h1 className="page-title">体験結果</h1>
      <p className="muted">課題: {SCENARIO.task}</p>
      {!r.purchased ? (
        <p data-testid="result-verdict">模擬購入は行われませんでした。</p>
      ) : (
        <>
          <p data-testid="result-verdict" className={r.success ? 'ok big' : 'ng big'}>
            {r.success ? '課題達成：予算内・追加保証なしで購入できました' : '課題未達成'}
          </p>
          <ul>
            <li>模擬購入額: {yen(r.totalYen)}（予算 {yen(SCENARIO.budgetYen)} {r.withinBudget ? '以内' : '超過'}）</li>
            <li>対象商品の購入: {r.boughtTarget ? 'あり' : 'なし'}</li>
            <li>追加保証: {r.forbiddenOptionsSelected.length ? '選択あり' : '選択なし'}</li>
          </ul>
          <p className="small muted">判定は確認できた状態（購入額・オプションの選択）だけで行っています。表示が購入判断の原因だったかどうかは判定しません。</p>
        </>
      )}
      <p>AIが行った画面の変更: {interventions.length}件</p>
      <div className="row-actions">
        <button className="btn-primary" data-testid="result-reveal" onClick={() => store.set({ revealOpen: true })}>
          種明かしを見る
        </button>
      </div>
    </div>
  );
}
