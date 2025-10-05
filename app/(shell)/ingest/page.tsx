const ingestSteps = [
  {
    title: "ファイルアップロード",
    detail: "Files API (purpose=assistants) へアップロードし、レスポンス ID を保持します。512MB 目安のサイズチェックを行います。",
  },
  {
    title: "Vector Store 登録",
    detail: "選択された Vector Store に対して file_batches を作成し、進捗をポーリングで追跡します。",
  },
  {
    title: "OCR 提案",
    detail: "PDF のテキスト層を調査し、スキャンの場合は Tesseract.js による OCR の案内を表示します。",
  },
];

export default function IngestPage() {
  return (
    <main className="page-grid">
      <div className="page-header">
        <h1 className="page-header-title">G3: 取り込み</h1>
        <p className="page-header-description">
          Docs / Audio / 画像などの添付を Vector Store に登録し、RAG で利用できるようにするフローをここで統括します。
        </p>
      </div>

      <section className="section-card">
        <div className="section-card-title">実装予定タスク</div>
        <div className="section-card-grid">
          {ingestSteps.map((item) => (
            <article key={item.title} className="section-card">
              <div className="section-card-title">{item.title}</div>
              <p className="section-card-description">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card">
        <div className="section-card-title">進捗表示</div>
        <p className="section-card-description">
          file_counts の completed/failed を棒状の進捗バーで可視化し、失敗ファイルは再試行操作を提供する計画です。
        </p>
      </section>
    </main>
  );
}
