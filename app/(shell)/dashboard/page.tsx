const backlogItems = [
  {
    label: "IndexedDB スキーマ",
    detail: "conversations/messages/attachments/settings をオブジェクトストアとして分離保存。タグ・検索のインデックスを整備。",
  },
  {
    label: "会話一覧 UI",
    detail: "更新順ソート、タグフィルタ、JSONエクスポート/インポートを提供。IndexedDB との双方向同期を行う。",
  },
  {
    label: "Vector Store 一覧",
    detail: "GET /v1/vector_stores の結果をキャッシュし、ID ワンクリコピーと更新日時の表示を行う。",
  },
];

export default function DashboardPage() {
  return (
    <main>
      <div className="page-header">
        <h1 className="page-header-title">G1: ダッシュボード</h1>
        <p className="page-header-description">
          ローカル履歴と OpenAI Vector Store 一覧を俯瞰し、チャット再開やストア管理へ遷移するための画面です。
        </p>
      </div>

      <section className="section-card">
        <div className="section-card-title">初期スコープ</div>
        <ul className="section-card-grid">
          {backlogItems.map((item) => (
            <li key={item.label} className="section-card">
              <div className="section-card-title">{item.label}</div>
              <p className="section-card-description">{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="section-card">
        <div className="section-card-title">受入基準メモ</div>
        <p className="section-card-description">
          IndexedDB から読み込んだ会話を JSON エクスポートし、同一PCでインポートすると一覧が再現されること。
        </p>
      </section>
    </main>
  );
}
