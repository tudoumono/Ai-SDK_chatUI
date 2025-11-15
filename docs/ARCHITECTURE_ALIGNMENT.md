# Frontend / Backend Alignment Status

このドキュメントは、MAGISystem2 で求められている **Amplify + AgentCoreRuntime (Next.js → Python)** 構成と、現在の `Ai-SDK_chatUI` リポジトリの実装内容がどの程度一致しているかを整理したメモです。

## 1. 現状のフロントエンド実装
- ルートの `README.md` は、アプリを「完全ローカル動作の AI チャットアプリ（ブラウザ版＝静的 HTML、デスクトップ版＝Tauri）」として説明しており、ホスティングや BFF を前提としていません。Next.js / React / Tauri のみが利用技術として挙げられています。
- `next.config.mjs` は `output: "export"` と `images.unoptimized: true` を指定しており、Next.js を **静的エクスポート**専用でビルドする設定になっています。`next dev` の開発サーバー以外では API ルートや server actions を持たない構成です。
- `package.json` のスクリプト群は `next dev/build`, `npx serve out`, `tauri dev/build` に限定されており、Amplify CLI / Codegen / Hosting / SSR 関連のコマンドは存在しません。依存関係も Next.js + React + Tauri で完結しており、Amplify ランタイムや AppSync SDK は含まれていません。

## 2. クライアントからの API 呼び出し
- `lib/openai/*.ts`（例: `vector-stores.ts`, `models.ts`, `org-validation.ts`）は、`fetch` で `https://api.openai.com/v1` 配下のエンドポイント (`/vector_stores`, `/models`, `/files` など) を**ブラウザから直接**呼び出しています。アプリ内では `ConnectionSettings` に保存された API キーを `Authorization: Bearer` ヘッダに載せ、OpenAI 互換 API へ直アクセスする前提です。
- `lib/security/base-url.ts` は Base URL のバリデーションで `DEFAULT_ALLOWED_HOSTS = ["api.openai.com"]` としており、`NEXT_PUBLIC_ALLOWED_OPENAI_HOSTS` で明示的に許可しない限り **OpenAI 本番ホスト以外を拒否**します。このため、Next.js BFF や自前の API Gateway（Amplify 側のバックエンド URL）へ切り替える余地がほぼありません。

## 3. バックエンド（Next.js 側）
- Next.js は `output: "export"` のため Node.js サーバープロセスを伴わず、`app/api` ディレクトリも存在しません。よって Amplify Hosting／SSR 上で API Routes を中継する構成を取れません。
- リポジトリには Amplify の `amplify/` ディレクトリ、`aws-exports.js`、`amplify.yml` などのメタデータも無く、Amplify でのフロント／バック構築が行われた痕跡はありません。

## 4. バックエンド（Python / AgentCoreRuntime）
- `rg --files -g '*.py'` を実行すると該当ファイルは 0 件で、Python コードや Dockerfile も配置されていません。AgentCoreRuntime / strands Agent と思われる Python スタックは未導入です。
- Next.js から別コンテナの Python ランタイムを呼ぶための API クライアント、エンドポイント定義、接続設定も確認できません。

## 5. 期待構成とのギャップ
| 項目 | 期待値 (Amplify + AgentCoreRuntime) | 現状 | 差分 |
|------|-----------------------------------|------|------|
| フロントエンド | Amplify Hosting 上の Next.js (SSR/ISR) | 静的エクスポートされた Next.js + Tauri | Amplify 連携・SSR 設定が無い |
| BFF / Next.js API | Amplify で動く Next.js API か APIGW 連携 | API ルートなし・OpenAI へ直接 fetch | BYOK をブラウザから OpenAI に送信しており、BFF 経由でのヘッダ統制やキー管理ができない |
| Python ランタイム | Docker 上の AgentCoreRuntime (Next.js → Python) | Python / Docker 関連ファイルなし | AgentCoreRuntime の導入ゼロ |
| 接続可否 | Amplify 側エンドポイント (例: `/api/chat`) を叩けるよう Base URL を設定 | `api.openai.com` 以外を拒否 | 独自 API を登録できない |

## 6. 対応の方向性
1. **Amplify プロジェクトの初期化**: `amplify init` + `amplify add hosting` / `amplify add custom` 等で、Next.js アプリを Amplify でビルド & SSR 実行できるようにする。併せて `aws-exports.js` や `amplify.yml` を配置し、`package.json` に Amplify 向けコマンドを追加する。
2. **Next.js API/BFF 層の実装**: `app/api/.../route.ts` もしくは Route Handlers を追加し、ブラウザからのリクエストを Amplify 経由で受けて Python ランタイムへフォワードする構成に切り替える。その際、`lib/security/base-url.ts` のホワイトリストを Amplify ドメインに合わせて拡張する。
3. **Python AgentCoreRuntime 連携**: `backend/python/` 等に Dockerfile と AgentCoreRuntime（strandsAgent）のエントリポイントを追加し、Next.js BFF → Python (Docker) → OpenAI というフローを確立する。Amplify 側からは ECS/Fargate もしくは Amplify の CI/CD でビルドした Docker を呼び出す運用を想定する。
4. **設定ストアの拡張**: `ConnectionSettings` に Amplify/API Gateway のエンドポイントや認証情報を格納できるようスキーマを再設計し、BYOK をブラウザで持たせずにサーバー側へ委譲する。

以上から、現行の `Ai-SDK_chatUI` はブラウザ単体完結型であり、リクエストされた Amplify + AgentCoreRuntime (Python) 3層構成とは一致していません。上記ギャップを順次解消する必要があります。
