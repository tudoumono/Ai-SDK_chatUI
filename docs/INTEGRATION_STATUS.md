# Amplify + AgentCore Runtime Integration Status

このレポートは、提示された要件「Amplify ホスティング + AgentCore Runtime（Next.js 経由で Python スタンドアローン Agent）」に対し、現状の `Ai-SDK_chatUI` リポジトリがどのような構成になっているかを整理し、フロントエンド／Next.js バックエンド／Python バックエンドの整合性を評価したものです。

## 1. 現状サマリー
- **UIは完全にクライアントサイドの Next.js App Router 実装**で、`app/(shell)/…` 配下に G0〜G5 の画面が収められています。チャット画面（`chat/page.tsx`）は `ConnectionSettings` をロードし、OpenAI API 向けの `fetch` と SDK 呼び出しを直接行います。【F:app/(shell)/chat/page.tsx†L1-L120】
- **OpenAI との通信はブラウザ／Tauri から直接行われており、Next.js API Routes や Amplify Functions を経由していません。** `lib/chat/openai-client.ts` で OpenAI SDK（ブラウザ許可モード）または Tauri 側の `invoke` ラッパーを生成していることが確認できます。【F:lib/chat/openai-client.ts†L1-L30】
- **RAG（Vector Store）、ファイル連携、Responses API ストリーミングもすべてフロントエンド内で完結**しており、`lib/openai/vector-stores.ts` ではブラウザ `fetch` を使って `/vector_stores` などのエンドポイントを直接呼び出しています。【F:lib/openai/vector-stores.ts†L1-L188】
- **Next.js バックエンド（API ルートや Amplify 経由の Lambda）は未実装**で、`package.json` のスクリプトは `next dev/build` と静的 `serve`、および Tauri 向けコマンドのみです。【F:package.json†L5-L41】
- **Python 実装や AgentCore Runtime 連携コードは見当たらず、リポジトリ内に `.py` ファイル自体が存在しません。**（`rg --files -g '*.py'` の結果より）【a06557†L1-L2】

以上より、要求されている「フロント（Amplify/Next）→ Next.js バックエンド → Python AgentCore Runtime(Docker)」の 3 層構成はまだ整っておらず、現状は「ブラウザ（または Tauri）→ OpenAI API 直呼び」の 2 層構成になっています。

## 2. フロントエンド（Next.js App Router）
| 項目 | 観測内容 |
| --- | --- |
| 画面構成 | `app/(shell)/welcome`, `dashboard`, `chat`, `vector-stores`, `ingest`, `settings`, `admin` など、要件ドキュメント（設計.md）の G0〜G5 がそのままページとして存在。|
| 接続管理 | `ConnectionSettings` を IndexedDB/Storage に保存し、`loadConnection()` でロードした情報を `ChatPage` などで使用。|
| API 呼び出し | `streamAssistantResponse`／`uploadFileToOpenAI`／`fetchVectorStoresFromApi` などすべて UI から直接呼び出し。|
| Tauri 連携 | ブラウザでは OpenAI SDK、デスクトップでは `@tauri-apps/api` の `invoke` で HTTP を代理。|

この構成はユーザー BYOK を前提としたクライアントサイド実装としては一貫していますが、Amplify 側に API を配置する前提とは乖離しています。

## 3. Next.js バックエンド（Amplify Functions 等）
- `app/api/*` や `pages/api/*` ディレクトリは存在せず、API Route が提供するミドル層は未定義です（`ls app` でも `api` ディレクトリは確認できません）。【3b571e†L1-L2】
- `package.json` にも Amplify CLI／cognito／lambda 関連スクリプトはなく、Amplify Hosting の設定ファイル（`amplify/` ディレクトリ等）もありません。
- したがって、フロントエンドが Next.js API を経由して AgentCore Runtime へリクエストを転送する道筋はまだ用意されていません。

## 4. Python / AgentCore Runtime
- リポジトリ直下およびサブディレクトリに Python ファイルはなく、Dockerfile も `src-tauri` 以外には存在しません。`rg --files -g '*.py'` による検索でもヒットが 0 件です。【a06557†L1-L2】
- AgentCore Runtime（`agentcoreruntime` や `strandsAgent`）に関するコードや依存定義もありません。`package.json`／`tsconfig`／`docs` 内でも該当キーワードは確認できません。
- そのため、「Next.js → Python (Docker)」の RPC/REST/EVENT 契約やスキーマ整合性はまだ検証できる段階ではありません。

## 5. 整合性ギャップと対応指針
| 要素 | 現状 | 必要な整合性ギャップ |
| --- | --- | --- |
| フロント (Next.js Amplify Hosting) | UI は完成しているが OpenAI 直呼び | Amplify Hosting 用の build/export 手順、`aws-exports.js`/`amplify/` の導入、API エンドポイントの接続先切り替えが必要 |
| Next.js バックエンド | 不在 | `app/api` などに REST/RPC 層を実装し、Amplify Functions でデプロイ。UI からの `createResponsesClient` をこの層へ差し替える必要あり。|
| Python AgentCore Runtime (Docker) | 不在 | AgentCore Runtime を含む Docker イメージ、Next.js backend との RPC/REST 契約、Amplify からのデプロイパイプライン整備が必要。|

## 6. 推奨アクション
1. **バックエンド Next.js API の足場を作成**し、`createResponsesClient` や `vector-stores` API 呼び出しを Next.js 経由に切り替える。
2. **AgentCore Runtime (Python) を Docker 化**し、Next.js API から HTTP/IPC で呼び出せるエンドポイント（例：`/agent/respond`）を定義する。
3. **Amplify プロジェクトを初期化**し、ホスティング＋Functions＋コンテナ連携の IaC を追加。フロントの `ConnectionSettings` には Amplify API Gateway の URL を保存できるようにする。
4. 上記が揃い次第、**UI/バックエンド/Python のインターフェース仕様書**を整備してスキーマやエラーハンドリングを共有する。

---
現状のコードベースではフロントエンド以外のレイヤーが存在しないため、上記のギャップを埋める実装が不可欠です。まずは Next.js API ルートと AgentCore Runtime の最小構成を追加し、UI が Amplify 経由のバックエンドを参照できるようにすることを推奨します。
