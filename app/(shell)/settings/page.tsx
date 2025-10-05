const sections = [
  {
    title: "モデル設定",
    detail: "GET /v1/models の結果から用途フィルタ・検索機能付きで選択。手動入力も許容します。",
  },
  {
    title: "プロキシ/ゲートウェイ",
    detail: "Base URL と追加ヘッダを保存し、/v1/models で接続テスト。CORS 対策のガイダンスを添えます。",
  },
  {
    title: "履歴管理",
    detail: "JSON エクスポート/インポート、暗号化パスフレーズによる AES-GCM 保存の On/Off 切替を提供します。",
  },
];

export default function SettingsPage() {
  return (
    <main>
      <div className="page-header">
        <h1 className="page-header-title">G5: 設定</h1>
        <p className="page-header-description">
          モデル一覧、プロキシ設定、履歴保存ポリシーを集約し、Responses API との接続性をコントロールします。
        </p>
      </div>

      <section className="section-card">
        <div className="section-card-title">設定セクション</div>
        <div className="section-card-grid two-columns">
          {sections.map((item) => (
            <article key={item.title} className="section-card">
              <div className="section-card-title">{item.title}</div>
              <p className="section-card-description">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card">
        <div className="section-card-title">暗号化オプション</div>
        <p className="section-card-description">
          WebCrypto AES-GCM + PBKDF2 で暗号化鍵を導出し、IndexedDB 保存時に適用する実装を後続タスクに位置付けています。
        </p>
      </section>
    </main>
  );
}
