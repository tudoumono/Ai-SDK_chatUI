import Link from "next/link";

const storagePolicies = [
  {
    title: "保存しない",
    description: "セッション中のみ API キーを保持し、ページを閉じると破棄します。",
  },
  {
    title: "一時保存",
    description: "IndexedDB に暗号化して保存。タブをまたいで利用できます。",
  },
  {
    title: "永続保存",
    description: "暗号化パスフレーズを必須にして長期保存します。",
  },
];

export default function WelcomePage() {
  return (
    <main className="welcome-page">
      <section className="section-card">
        <h1 className="page-header-title">G0: ウェルカム / キー設定</h1>
        <p className="page-header-description">
          BYOK（Bring Your Own Key）モデルで API キー、Base URL、追加ヘッダを登録し、/v1/models で接続テストを実行します。
        </p>
      </section>

      <section className="section-card">
        <div className="section-card-title">保存ポリシー</div>
        <div className="section-card-grid two-columns">
          {storagePolicies.map((policy) => (
            <article key={policy.title} className="section-card">
              <div className="section-card-title">{policy.title}</div>
              <p className="section-card-description">{policy.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card">
        <div className="section-card-title">接続テスト</div>
        <p className="section-card-description">
          成功時🟢表示、401/403/429/ネットワーク/CORS を分類し、必要ならプロキシ切替のガイダンスを表示します。
        </p>
        <p className="section-card-description">
          初期設定が完了したら <Link href="/chat">チャット画面</Link> へ遷移します。
        </p>
      </section>
    </main>
  );
}
