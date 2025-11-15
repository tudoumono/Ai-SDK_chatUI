# Amplify + AgentCore Runtime 整合性チェック

このドキュメントは、`claude/reorganize-project-structure-01LZvaKNFMtyAbTRMwnfqxgb` で合意した「Amplify (Next.js) フロント → Amplify Functions/Next.js バックエンド → AgentCore Runtime (Python, Docker)」構成と、現在の `Ai-SDK_chatUI` リポジトリの実装状況の整合性を確認するためのメモです。各層の状態、ギャップ、次のアクションを以下に整理します。

## 1. 現状サマリー

| レイヤー | 期待構成 | 現在の実装 | 整合性判定 |
| --- | --- | --- | --- |
| フロントエンド (Next.js on Amplify Hosting) | Amplify Hosting 上の Next.js 15 App Router。Amplify Auth/Storage などを利用し、バックエンド Next.js/API Routes を叩く | Next.js 15 + React 19 のシングルページアプリ。`npm run build` → `out/` を静的配布し、OpenAI へ **ブラウザから直接**接続している | ⚠️ Amplify Hosting 相当の Next.js ではあるが、API コールがバックエンド経由ではなく OpenAI 直通 | 
| バックエンド (Next.js / Amplify Functions) | App Router の `app/api/*` や Amplify Functions で REST/GraphQL 経由の BFF を実装し、Python Runtime へプロキシする | `app/api` ディレクトリや Amplify CLI 由来の `amplify/` フォルダが存在せず、`package.json` のスクリプトも静的ビルドのみ | ❌ レイヤーそのものが未構築 |
| バックエンド (AgentCore Runtime, Python+Docker) | AgentCore Runtime (StarAnds Agent 連携) を Docker コンテナとして起動し、Next.js バックエンドから gRPC/HTTP で連携 | リポジトリには Python/Poetry/requirements 関連ファイルや AgentCore スクリプト、Dockerfile (Python) が存在しない。`docs/DEPLOYMENT_GUIDE.md` も Nginx で静的配信する手順のみを説明 | ❌ レイヤー未構築 |

## 2. フロントエンドの詳細確認

- `package.json` は Next.js / React / AI SDK / Tauri などのフロント依存のみを持ち、Amplify CLI/ライブラリ (`aws-amplify`, `@aws-amplify/*`) や BFF 通信用 SDK は含まれていません。【F:package.json†L5-L42】
- `README.md` ではビルドした `out/` をブラウザ配布する運用と、OpenAI API キーを各ユーザーが直接入力する BYOK 方針を説明しており、バックエンドを介さない前提です。【F:README.md†L36-L112】【F:README.md†L148-L188】
- `app/(shell)/settings/page.tsx` では `/v1/models` 接続をユーザーの入力値 (API キー / Base URL / 追加ヘッダ) で検証し、ローカル IndexedDB に保存する UI を実装しています。バックエンドや Amplify Auth との連携は存在しません。【F:app/(shell)/settings/page.tsx†L370-L506】
- `lib/chat/openai-client.ts` はブラウザから直接 `OpenAI` SDK を初期化しており、BFF 経由の API 呼び出しが定義されていません。【F:lib/chat/openai-client.ts†L1-L30】

➡️ **評価:** フロントエンド自体は Next.js 15 App Router で構築済み。ただし Amplify Hosting に合わせた環境変数管理、認証、BFF 呼び出しの抽象化が未着手のため、Amplify/AgentCore 構成とは接続していない状態です。

## 3. Next.js / Amplify バックエンドの確認

- `app/` 配下に `api/` ルートや `route.ts` を持つサーバーコンポーネントが存在せず、SSR/API 機能を提供していません (App Router 画面のみ)。
- `package.json` のスクリプトは `next dev/build` と `npx serve out` に限られ、Amplify CLI (`amplify push`, `amplify function`) などのタスクが未定義です。【F:package.json†L5-L13】
- `docs/DEPLOYMENT_GUIDE.md` は `npm run build` で生成した `out/` を Nginx で配信する手順を紹介しており、サーバーサイドの API や Amplify 環境構築には触れていません。【F:docs/DEPLOYMENT_GUIDE.md†L320-L399】

➡️ **評価:** BFF/Amplify レイヤーがリポジトリ内に存在しないため、フロントと Python Runtime の間を仲介する土台が欠落しています。最低限、`amplify/` プロジェクト初期化、`app/api/*` や `pages/api/*` の API Route 実装、Amplify Hosting/Function の設定ファイルを追加する必要があります。

## 4. AgentCore Runtime (Python) の確認

- リポジトリには `*.py`, `requirements.txt`, `poetry.lock`, `Dockerfile` (Python ベース) といった AgentCore Runtime の資材が一切含まれていません。代わりに `docs/DEPLOYMENT_GUIDE.md` では `out/` を Nginx イメージにコピーするだけの Dockerfile を提示しており、バックエンド処理は行いません。【F:docs/DEPLOYMENT_GUIDE.md†L320-L332】
- Next.js 側コードは OpenAI API を直接叩く想定のため、AgentCore (Python) が参照するエンドポイントやデータ契約も未定義です。

➡️ **評価:** AgentCore Runtime レイヤーはまったく構築されておらず、Next.js 側から参照するエンドポイントの URL/スキーマを定義する作業から着手する必要があります。

## 5. 推奨アクション

1. **Amplify プロジェクトの初期化**
   - `amplify init` でホスティング/認証/関数の骨組みを生成し、`amplify/backend/function/...` に Next.js (Node) ランタイムの BFF を配置する。
   - App Router の `app/api/*` で Amplify Functions へプロキシするか、Amplify の `serverSideRendering` サポートを利用して BFF を公開する。

2. **BFF ⇔ AgentCore のコントラクト定義**
   - AgentCore Runtime (Python) 用に `backend/python/` などのディレクトリを作成し、`Dockerfile`, `requirements.txt`, `start.sh` を追加。
   - Next.js BFF から Python コンテナへ HTTP/gRPC で転送する API (例: `/api/agentcore/chat`, `/api/agentcore/tools`) を設計し、JSON スキーマを定義。

3. **フロントエンドの API 呼び出しレイヤーを差し替え**
   - `lib/chat/openai-client.ts` と設定画面の保存ロジックを、直接 OpenAI へ接続するのではなく BFF 経由 (`/api/models`, `/api/responses`, `/api/vector-stores`) で呼ぶよう改修。
   - Amplify Auth/Storage のクライアント SDK を導入し、環境変数 (`AWS_EXPORTS`, `AMPLIFY_CONFIG`) を `amplify pull` で同期する。

4. **整合性テストの自動化**
   - Amplify 環境 + Python コンテナを `docker-compose` で立ち上げるテストシナリオを作成し、`npm run lint && npm run build` に加えて `pytest`/`curl` ベースのエンドツーエンド検証を GitHub Actions に追加。

本メモをベースに、`MAGISystem2` リポジトリ側の進行と同期しながら段階的にレイヤーを追加してください。
