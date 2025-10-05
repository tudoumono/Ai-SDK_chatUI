const workflow = [
  {
    title: "作成",
    detail: "POST /v1/vector_stores でストアを作成し、レスポンス ID を即座にコピーできる UI を提供します。",
  },
  {
    title: "メタ更新",
    detail: "名称や説明を PATCH /v1/vector_stores/{id} で更新し、状態・容量の表示も行います。",
  },
  {
    title: "削除",
    detail: "使用中の会話がある場合は警告を表示し、DELETE 実行後に一覧をリフレッシュします。",
  },
];

export default function VectorStoresPage() {
  return (
    <main>
      <div className="page-header">
        <h1 className="page-header-title">G2: Vector Store 管理</h1>
        <p className="page-header-description">
          Store のライフサイクル（作成・更新・削除）とファイルバッチの状態把握を担う管理画面の雛形です。
        </p>
      </div>

      <section className="section-card">
        <div className="section-card-title">主な操作フロー</div>
        <div className="section-card-grid two-columns">
          {workflow.map((item) => (
            <article key={item.title} className="section-card">
              <div className="section-card-title">{item.title}</div>
              <p className="section-card-description">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card">
        <div className="section-card-title">ファイルバッチ監視</div>
        <p className="section-card-description">
          vector_stores/{id}/file_batches をポーリングし、in_progress/completed/failed をバッジ表示する予定です。
        </p>
      </section>
    </main>
  );
}
