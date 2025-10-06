"use client";

export default function GuidePage() {
  return (
    <main className="page-grid">
      <div className="page-header">
        <h1 className="page-header-title">📖 利用ガイド</h1>
        <p className="page-header-description">
          このアプリの使い方を説明します。初めての方はここから始めてください。
        </p>
      </div>

      <section className="section-card">
        <div className="section-card-title">はじめに</div>
        <p className="section-card-description">
          このアプリは、OpenAIのAIとチャットができるアプリケーションです。
          会話履歴はすべてあなたのパソコン内に保存され、外部サーバーには送信されません。
        </p>
      </section>

      <section className="section-card">
        <div className="section-card-title">必要なもの</div>
        <ul style={{ lineHeight: "1.8", marginLeft: "1.5rem" }}>
          <li>
            <strong>OpenAI APIキー</strong> - OpenAIのアカウントが必要です
            <ul style={{ marginTop: "0.5rem", marginLeft: "1.5rem" }}>
              <li>
                登録先:{" "}
                <a
                  href="https://platform.openai.com/signup"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#0066cc", textDecoration: "underline" }}
                >
                  https://platform.openai.com/signup
                </a>
              </li>
              <li>
                APIキー取得:{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#0066cc", textDecoration: "underline" }}
                >
                  https://platform.openai.com/api-keys
                </a>
              </li>
              <li>料金: 使った分だけ課金（従量課金制）</li>
            </ul>
          </li>
          <li>
            <strong>インターネット接続</strong> - OpenAI APIと通信するために必要です
          </li>
        </ul>
      </section>

      <section className="section-card">
        <div className="section-card-title">初回起動の流れ</div>

        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
            1. アプリを起動
          </h3>
          <p style={{ marginLeft: "1rem", lineHeight: "1.6" }}>
            デスクトップアプリ版の場合: <code className="inline-code">ai-sdk-chatui.exe</code>{" "}
            をダブルクリック
            <br />
            ブラウザ版の場合: ブラウザでこのページを開く
          </p>
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
            2. APIキーを設定
          </h3>
          <p style={{ marginLeft: "1rem", lineHeight: "1.6" }}>
            初回起動時に「ウェルカム画面」が表示されます:
          </p>
          <ol style={{ marginLeft: "2rem", lineHeight: "1.8" }}>
            <li>
              <strong>OpenAI APIキー</strong> を入力
            </li>
            <li>
              （任意）<strong>暗号化パスフレーズ</strong> を設定
              <ul style={{ marginLeft: "1.5rem", marginTop: "0.3rem" }}>
                <li>設定すると、APIキーが暗号化されて安全に保存されます</li>
                <li>次回起動時にパスフレーズの入力が必要になります</li>
              </ul>
            </li>
            <li>「保存して開始」ボタンをクリック</li>
          </ol>
        </div>

        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
            3. チャットを開始
          </h3>
          <p style={{ marginLeft: "1rem", lineHeight: "1.6" }}>
            ダッシュボードが表示されたら、「新しい会話」ボタンをクリックしてチャットを始められます。
          </p>
        </div>
      </section>

      <section className="section-card">
        <div className="section-card-title">基本的な使い方</div>

        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
            チャット画面
          </h3>
          <ul style={{ marginLeft: "1.5rem", lineHeight: "1.8" }}>
            <li>
              <strong>メッセージ入力</strong>: 画面下部のテキストボックスに質問を入力
            </li>
            <li>
              <strong>送信</strong>: Enterキーまたは送信ボタンをクリック
            </li>
            <li>
              <strong>ファイル添付</strong>: 📎ボタンから画像やPDFを添付可能
            </li>
            <li>
              <strong>新しい会話</strong>: 左上の「+」ボタンから新規会話を作成
            </li>
          </ul>
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
            会話の管理
          </h3>
          <ul style={{ marginLeft: "1.5rem", lineHeight: "1.8" }}>
            <li>
              <strong>お気に入り</strong>: ⭐ボタンで会話をお気に入りに追加
            </li>
            <li>
              <strong>タグ付け</strong>: 🏷️ボタンで会話にタグを追加（分類・検索用）
            </li>
            <li>
              <strong>削除</strong>: 🗑️ボタンで不要な会話を削除
            </li>
          </ul>
        </div>

        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
            データのバックアップ
          </h3>
          <p style={{ marginLeft: "1rem", lineHeight: "1.6" }}>
            設定画面（⚙️）から「データのインポート/エクスポート」を選択:
          </p>
          <ul style={{ marginLeft: "1.5rem", lineHeight: "1.8" }}>
            <li>
              <strong>エクスポート</strong>: 会話履歴をJSONファイルとして保存
            </li>
            <li>
              <strong>インポート</strong>: 保存したJSONファイルを読み込んで復元
            </li>
          </ul>
        </div>
      </section>

      <section className="section-card">
        <div className="section-card-title">よくある質問</div>

        <div style={{ marginBottom: "1rem" }}>
          <h4 style={{ fontSize: "0.95rem", fontWeight: "600", marginBottom: "0.3rem" }}>
            Q. インストールは必要ですか？
          </h4>
          <p style={{ marginLeft: "1rem" }}>
            A. デスクトップアプリ版の場合、exeファイルをダブルクリックするだけで起動します。インストール不要です。
          </p>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <h4 style={{ fontSize: "0.95rem", fontWeight: "600", marginBottom: "0.3rem" }}>
            Q. インターネット接続は必要ですか？
          </h4>
          <p style={{ marginLeft: "1rem" }}>
            A. はい。OpenAI APIと通信するため、インターネット接続が必要です。
          </p>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <h4 style={{ fontSize: "0.95rem", fontWeight: "600", marginBottom: "0.3rem" }}>
            Q. 会話データはどこに保存されますか？
          </h4>
          <p style={{ marginLeft: "1rem" }}>
            A.
            すべてあなたのPC内に保存されます（ブラウザのIndexedDB）。外部サーバーには送信されません。
          </p>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <h4 style={{ fontSize: "0.95rem", fontWeight: "600", marginBottom: "0.3rem" }}>
            Q. APIキーの料金はいくらですか？
          </h4>
          <p style={{ marginLeft: "1rem" }}>
            A. OpenAIの料金体系に従います。詳細は{" "}
            <a
              href="https://openai.com/pricing"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#0066cc", textDecoration: "underline" }}
            >
              https://openai.com/pricing
            </a>{" "}
            を確認してください。
          </p>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <h4 style={{ fontSize: "0.95rem", fontWeight: "600", marginBottom: "0.3rem" }}>
            Q. パスフレーズを忘れた場合は？
          </h4>
          <p style={{ marginLeft: "1rem" }}>
            A. APIキーを再入力する必要があります。設定画面から再設定できます。
          </p>
        </div>

        <div>
          <h4 style={{ fontSize: "0.95rem", fontWeight: "600", marginBottom: "0.3rem" }}>
            Q. アプリを削除したい場合は？
          </h4>
          <p style={{ marginLeft: "1rem" }}>
            A.
            デスクトップアプリ版の場合、exeファイルを削除するだけでOKです。会話データはブラウザのIndexedDBに残ります。完全に削除したい場合は、設定画面から「履歴を削除」を実行してください。
          </p>
        </div>
      </section>

      <section className="section-card">
        <div className="section-card-title">⚠️ 注意事項</div>

        <div style={{ marginBottom: "1.5rem" }}>
          <h3
            style={{
              fontSize: "1rem",
              fontWeight: "600",
              marginBottom: "0.5rem",
              color: "#d32f2f",
            }}
          >
            免責事項
          </h3>
          <ul style={{ marginLeft: "1.5rem", lineHeight: "1.8" }}>
            <li>このアプリケーションは無保証で提供されています</li>
            <li>利用は完全に自己責任でお願いします</li>
            <li>
              データの損失やAPIキーの漏洩について、開発者は一切の責任を負いません
            </li>
            <li>OpenAI APIの利用料金は、ユーザー自身が負担します</li>
            <li>トラブルが発生した場合のサポートは提供していません</li>
          </ul>
        </div>

        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
            🔒 セキュリティのヒント
          </h3>
          <ul style={{ marginLeft: "1.5rem", lineHeight: "1.8" }}>
            <li>APIキーは他人に共有しないでください</li>
            <li>暗号化パスフレーズは忘れないようにメモしておいてください</li>
            <li>
              定期的にデータをエクスポートしてバックアップを取ることをおすすめします
            </li>
            <li>共有PCでは「セッション保存」または「保存しない」を選択してください</li>
          </ul>
        </div>
      </section>

      <div style={{ textAlign: "center", marginTop: "2rem", padding: "1rem" }}>
        <p style={{ color: "#888", fontSize: "0.9rem" }}>
          さらに詳しい情報は、左のメニューから各画面をご覧ください。
        </p>
      </div>
    </main>
  );
}
