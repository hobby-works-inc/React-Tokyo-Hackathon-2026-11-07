# ポチモール：生成UIで誘導するECデモ

普通のECサイトを使っていると、AI が操作の傾向を読み取り、その場で小さな React UI を生成して購買判断を誘導します。最後に誘導の仕組みを確認し、安全なUIへ作り替えられる体験型アプリです（React Tokyo 温泉合宿 2026/11/07 ハッカソン）。

本物の利用者を騙すためのものではなく、生成UIによる誘導を体験・可視化する訓練用シミュレーションです。商品・価格・レビューはすべて架空で、決済・配送は発生しません。

```
ユーザーがECサイトを操作
  → ブラウザがエリア別の行動を集計（観測事実のみ）
  → LLM が行動の意味と次の対応を判断（noop も可）
  → 必要な場合だけ React/TSX を生成
  → サーバーで検証・トランスパイル → sandbox iframe で表示
  → そのUIへの反応を再び観測
```

- スタック: React 19 / TypeScript / [Waku](https://waku.gg) 1.0.0-rc.4。デプロイ先は Cloudflare Workers
- LLM: [OpenCode Console Inference API](https://opencode.ai/docs/console/api/inference/)（サーバー側からのみ呼ぶ。ブラウザへキーを渡さない）

## 起動

```sh
npm install
cp .env.example .env.local   # 必要なら値をセット（mock なら何もしなくて良い）
npm run dev                  # http://localhost:3000
```

`npm run dev` は、sandbox iframe 用の固定ランタイム（`public/sandbox/runtime.js`）を esbuild でバンドルしてから `waku dev` を起動します。

## 環境変数

| 変数 | 種別 | 説明 |
| --- | --- | --- |
| `OPENCODE_API_KEY` | secret | OpenCode Console の API キー（`oc_sk_...`）。live で必須 |
| `DEMO_ACCESS_TOKEN` | secret・任意 | 公開URLを無制限のLLMプロキシにしないための合言葉。セットすると live では同意画面で合言葉の入力と確認が必要。誤り・期限切れで 401 になると、画面上部に表示して送信を止め、再入力で再開する |
| `LLM_MODE` | var | `mock`（既定）/ `live` |
| `OPENCODE_BASE_URL` | var | 既定 `https://opencode.ai/inference` |
| `OPENCODE_MODEL` | var | 既定 `claude-sonnet-5-5`（一覧は `https://opencode.ai/inference/v1/models`） |
| `OPENCODE_API_FORMAT` | var | `auto`（既定。`claude*`/`qwen*` は Messages API、それ以外は Chat Completions）/ `anthropic` / `openai-chat` |
| `OPENCODE_THINKING` | var | `off`（既定。Claude の拡張思考を切る。Haiku は `disabled`、Sonnet/Opus は `between_tools` を送る）/ `on`（モデル既定の思考。遅い） |
| `LLM_TIMEOUT_MS` | var | 既定 `30000` |
| `LLM_MAX_REQUESTS_PER_MINUTE` | var | セッションごとの上限。既定 `20`（全体は10倍） |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | デプロイ用 | wrangler 標準。アプリ本体では使わない |

OpenCode の API はクライアントIDを使いません（`Authorization: Bearer <APIキー>` のみ）。

## live / mock の切り替え

- **mock**（既定・キー不要）: LLM は呼ばず、観測内容（どこに滞在したか、カート追加、無操作、戻りスクロール、閉じた・断った等）と直前の反応から、手口の部品（カウントダウン、閲覧者数、購入通知、在庫わずか、配送の締め切り、断る側の罪悪感、二重否定チェック、比較の歪め、1日あたり換算、診断、くじ引き、迷いの指摘、しつこいリマインド、点滅、「ちょっと待って」ポップアップ、逃げる「いいえ」ボタン、エラー風の警告、サポート担当風チャット、本人確認風チェック、スクラッチ、スタンプカード、実績解除、マスコット、速報テロップ、小さくなる「いいえ」、占い、紙吹雪など約30種）と文言・配色・レイアウトを組み合わせて毎回 TSX を組み立てます（`src/lib/server/mockGen.ts`）。表示中や直前に使った手口は避け、閉じられたら別の手口・別の場所に切り替えます。同時表示は最大6つで、介入が続くほど・閉じたり断ったりするほど演出が激しくなります（通常→強め→最大級）。生成コードは live と同じ検証・トランスパイル・sandbox を通ります。画面上部に `MOCK（ルール生成・LLMなし）`、生成UIに `AI生成UI・mock` と表示し、ライブ生成と見せかけません。
- **live**: `LLM_MODE=live` と `OPENCODE_API_KEY` をセットします。画面上部が `LIVE: <モデル名>` になります。`LLM_MODE=live` でもキーがない場合は mock で動き、同意画面に理由を出します。
- 以前の固定3種（価格の限定バナー・保証トグル・カート比較）は `?mockScenario=classic`（既存 E2E が使用）。
- 失敗系の確認（mock のみ）: `?mockScenario=broken`（禁止APIを含むコード）/ `runtime_error`（描画時に例外）/ `slow`（応答を2.5秒遅らせる）

## Cloudflare へのデプロイ

```sh
export CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=...
npx wrangler secret put OPENCODE_API_KEY      # 値はプロンプトで入力
npx wrangler secret put DEMO_ACCESS_TOKEN     # 公開するなら推奨
# wrangler.jsonc の vars で LLM_MODE を "live" に
npm run deploy                                # = CLOUDFLARE=1 waku build → vars をマージ → wrangler deploy
```

Waku の Cloudflare ビルドが生成する `dist/server/wrangler.json` には `vars` が入らないため、`scripts/cf-postbuild.mjs` がルートの `wrangler.jsonc` の `vars` をマージします（シークレットが vars に入っていたらビルドを止めます）。ローカルで Workers 実行環境を試すなら `npm run build:cf && npx wrangler dev`（シークレットは `.dev.vars` に置く）。

## テスト

```sh
npm test            # vitest: 集計・送信制御・リビジョン確認・出力スキーマ・生成コード検証・メッセージ検証・料金
npm run e2e         # Playwright（mock モードの dev サーバーを自動起動）
npm run typecheck
```

E2E が確認していること: 正常系の1本のループ（観測 → 生成 → iframe 表示 → ウィジェットでの保証トグル → 料金反映 → 次の判断に反応が入る → カート → 模擬購入 → 結果 → 種明かし → 防御モード）、禁止APIのコードの拒否、実行時エラー時に通常ECが使えること、バックグラウンドタブで定期送信しないこと、連続クリックのデバウンス、生成中のリセット・ページ遷移・モード変更で古い応答を適用しないこと、体験終了後に生成が止まること、ダミー認証とパスワードが送信・保存・コンソールに出ないこと、タッチでホバー値を捏造しないこと。

## 2〜3分のデモ手順

1. 商品詳細（Aurora NC700）を開き、同意画面で「同意して体験を始める」。課題は「49,800円のヘッドホンを予算5万円以内・保証なしで買う」。
2. 価格の上にしばらくカーソルを置く → 数秒後、価格の近くに「人気上昇中」のバナーが生成される（`AI生成UI` タグ付き）。右下の「開発者パネル」で、エリア別の集計・LLMに送ったJSON・判断・生成コードを見せる。
3. 「カートに追加」 → 定期送信を待たずに、購入欄の近くに延長保証を勧めるトグルが生成される。トグルを押すと、ホスト側の購入欄のチェックと小計（¥52,780）が変わる。
4. カートへ → 合計付近に「保証あり」を強調する比較パネル。保証を外して模擬購入 → 体験結果で課題達成/未達成を表示。
5. 「種明かし」 → 観測事実 → AIの仮説 → 生成したUI → その後の観測 を時系列で見せる。
6. 「安全なUIに変える」 → 同じAIを防御モードに切り替え、直前の保証トグルを「既定オフ・料金明記・同じ大きさの選択肢」に作り替える。

## 構成

```
src/lib/config.ts            変更可能な初期値（送信間隔5秒・デバウンス250ms・文脈30秒・上部帯10〜40%・スロット・上限）
src/lib/scenario.ts          商品・料金・課題（正のデータ。LLM は書き換えられない）
src/lib/schema.ts            ObservationInput / UiDecision の zod スキーマ、根拠参照の検証
src/lib/observe/aggregator.ts    エリア別集計（IntersectionObserver・ポインタ・スクロール・可視性の値を受けて集計）
src/lib/observe/sendController.ts 主要操作の優先送信＋定期送信、同時1件、キャンセル、無操作の制限
src/lib/revision.ts          古い応答を適用しない判定（epoch / state / ui / mode / requestId）
src/lib/widgetCompiler.ts    生成TSXの検証（依存・禁止API・禁止要素）と sucrase によるトランスパイル
src/lib/messages.ts          iframe ↔ ホストのメッセージ契約と検証
src/lib/server/              /decide の本体、OpenCode クライアント、プロンプト、mock
src/sandbox/runtime.tsx      iframe 内の固定ランタイム（React 描画・観測・MessageChannel）
src/components/engine.ts     観測→送信→適用のループ（ブラウザ側）
src/components/              EC画面、生成スロット、SandboxFrame、種明かし、開発者パネル
src/pages/_api/decide.ts     POST /decide、 src/pages/_api/mode.ts  GET /mode
```

## 設計上のポイント

- **観測と推測を分ける**: ブラウザは「表示割合・表示時間・上部帯の時間・カーソル滞在/停止・再訪・クリック・スクロール」だけを集計し、心理ラベルは付けません。各値が差分期間（`deltaWindow`）・ページ表示からの累積・直近30秒のどれかを `metricScopes` で明示し、イベントは `isNew` で二重計上を防ぎます。カーソル滞在は視線ではありません。タッチではホバー値を `null` にします。止まったカーソルの下に別の要素が来ただけでは再訪にしません。非表示タブ・非フォーカス・ホストのモーダルで覆われている間は表示時間に数えません。フォームの値・キーストロークは集めません。
- **送信制御**: 主要操作（カート追加・オプション変更・ウィジェットを閉じる等）は250msでまとめて即送信、それ以外は5秒ごとに差分がある場合だけ送信。無操作の通知は最大2回・15秒間隔。同時実行は1件で、主要操作が来たら実行中をキャンセルし、キャンセル分の差分は集計に戻します。
- **古い応答を適用しない**: リクエストごとに epoch（リセット）・stateRevision（ページ・カート・認証）・uiRevision・modeRevision を記録し、応答時に一致しなければ捨てます。`requestId` と基準リビジョンはモデルの申告ではなくサーバーで入力値に上書きします。
- **LLM の出力**: 行動の解釈 → 変更の要否 → 必要なら TSX を1回の呼び出しで。zod で検証し、`evidenceRefs` のうち入力に存在しない参照は除外して確度を下げます。不正なら1回だけ修正を依頼します。
- **生成コードの実行**: サーバーでは実行しません（sucrase で変換し acorn で検査するだけ）。ブラウザでは `sandbox="allow-scripts"` のみの srcdoc iframe（不透明オリジン）で、CSP `default-src 'none'; connect-src 'none'; form-action 'none'` 等を付けて動かします。依存は `react` のみ。`fetch`・`window`・`parent`・`location`・`eval`・`Function`・`constructor` などの参照、`<a>`/`<img>`/`<form>`/`href`/`src`、`url()` を含む CSS は拒否します。
- **iframe との通信**: init 時にホストが MessageChannel のポートを渡し、以後はそのポートのみ。チャネルID・ウィジェットID・バージョン・メッセージ型・オプションIDを検証し、許可する操作は「既知の追加オプションの選択変更」「閉じる」「観測イベント」だけ。料金はホストで再計算します。購入確定・認証変更・遷移・親DOM操作はできません。
- **失敗時**: 新バージョンは非表示の iframe で描画を確認してから差し替え、構文エラー・禁止API・実行時エラー・4秒のタイムアウトでは直前の正常なUIを維持します。
- **固定のホスト操作**: 種明かし・安全なUIに変える・体験を終了・リセット・ポップアップの外枠と閉じるボタンはホスト側にあり、生成コードから変更できません。開発者パネルの操作は集計に含めません。

## 既知の制限・未実装

- 無限ループ対策として、サーバーでの変換時に生成コードのすべてのループ本体へ `__lg()` を差し込みます。ランタイムは、100ms ごとのタイマーが 500ms 以上進んでいなければ例外を投げ、描画失敗として扱います（直前の正常なUIを維持）。ただし、巨大な配列操作や組み込み関数の中の重い処理までは止められず、CPU 枯渇を完全に防ぐものではありません。sandbox iframe が別プロセスになるかはブラウザ次第です。描画確認の4秒タイムアウトと「リセット」が復旧手段です。サーバー側は生成コードを実行しないため影響を受けません（TSX は12,000文字まで）。
- 生成コードは iframe 内で固定ランタイムと同じ realm で動きます。そのためランタイムは、生成コードの評価前に `postMessage`・`userActivation` などを捕まえておきます。料金が変わる操作（`set_option`）は、`isTrusted` な実際のクリック・入力の直後だけ受け付けます。ホスト側も、直前1.5秒以内に固定ランタイムからクリック/変更の計測が届いていない `set_option` は拒否します。生成コードが `el.click()` や `useEffect` から保証をオンにしようとしても反映されず、`blocked_auto_option` として記録されます。
- 再読込後も、ログイン表示名とカートは sessionStorage から復元されます。観測・生成UI・同意状態は復元しません（再読込すると同意からやり直しです）。
- 生成ウィジェットは `'unsafe-eval'` を許可した iframe 内で評価します（不透明オリジン・通信不可の CSP 下）。親ページ自体には CSP ヘッダーを付けていません。
- レート制限は Workers の isolate 単位のベストエフォートです。公開するなら `DEMO_ACCESS_TOKEN` に加えて Cloudflare の Rate Limiting やアクセス制御を検討してください。
- ログイン・登録は固定のダミーで、アクセス制御ではありません。表示名とカートだけを sessionStorage に保持します。
- mock の判断はルールと乱数による組み合わせで、live のように新しい手口そのものを発明はしません。
- 静的なJSX属性検査（`href=` 等）は文字列ベースです。CSP と sandbox が最終的な防御です。
