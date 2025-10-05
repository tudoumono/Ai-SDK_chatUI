const featureItems = [
  {
    title: "入出力トグル",
    description:
      "Web検索・Vector検索・モデル選択をまとめた送信フォーム。トグルの状態は Responses API の tools 配列に反映します。",
  },
  {
    title: "添付カード",
    description:
      "画像（Vision）、文書（Vector Store 登録）、音声（文字起こし→今だけ）に対応するカード UI を表示します。",
  },
  {
    title: "ストリーミング描画",
    description:
      "Vercel AI SDK の streamText で中間ツールコールと最終応答を逐次描画します。",
  },
  {
    title: "出典パネル",
    description:
      "Vector / Web / 添付の引用メタデータをタブ切り替えで表示し、参照元が明確になるようにします。",
  },
];

export default function ChatPage() {
  return (
    <main className="page-grid">
      <div className="page-header">
        <h1 className="page-header-title">G4: 検索 & チャット</h1>
        <p className="page-header-description">
          Responses API の file_search / web_search ツールとマルチモーダル入力を組み合わせたコア体験です。
        </p>
      </div>

      <section className="section-card">
        <div className="section-card-title">UIフロー概要</div>
        <div className="section-card-description">
          モデル選択、トグル、入力欄、会話ストリームの 4 レイヤーで構成します。IndexedDB の履歴読み込み後に
          `generateObject` 要約で古いメッセージを圧縮しつつ送信します。
        </div>
        <div className="section-card-description">
          実装では AI SDK の <code>streamText</code> をラップした React Server Component + Client Component の構成を採用します。
        </div>
      </section>

      <section className="section-card">
        <div className="section-card-title">主要機能コンポーネント</div>
        <div className="section-card-grid two-columns">
          {featureItems.map((item) => (
            <article key={item.title} className="section-card">
              <div className="section-card-title">{item.title}</div>
              <p className="section-card-description">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-card">
        <div className="section-card-title">関連設計ドキュメント</div>
        <p className="section-card-description">
          リポジトリ直下の 設計.md (G4 セクション) を実装指針として参照し、API バインディングと UI 実装を段階的に進めます。
        </p>
      </section>
    </main>
  );
}
