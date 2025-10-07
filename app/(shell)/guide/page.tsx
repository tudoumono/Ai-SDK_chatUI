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
              <strong>ファイル添付</strong>: 📎ボタンから画像やPDFを添付可能（チャットに直接添付）
            </li>
            <li>
              <strong>新しい会話</strong>: 左上の「+」ボタンから新規会話を作成
            </li>
            <li>
              <strong>Vector Store選択</strong>: 右サイドバーでVector Storeを選択してRAG機能を利用
            </li>
          </ul>
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
            会話の管理
          </h3>
          <ul style={{ marginLeft: "1.5rem", lineHeight: "1.8" }}>
            <li>
              <strong>タグ付け</strong>: チャット画面の左サイドバーでタグを追加・削除（分類・検索用）
            </li>
            <li>
              <strong>削除</strong>: 🗑️ボタンで不要な会話を削除
            </li>
            <li>
              <strong>お気に入り機能</strong>: お気に入りに登録した会話は自動削除から保護されます
            </li>
          </ul>
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
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

        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
            🔍 ダッシュボードの検索機能
          </h3>
          <p style={{ marginLeft: "1rem", lineHeight: "1.6" }}>
            ダッシュボード画面で過去の会話を素早く見つけられます:
          </p>
          <ul style={{ marginLeft: "1.5rem", lineHeight: "1.8" }}>
            <li>
              <strong>キーワード検索</strong>: タイトル、タグ、メッセージ本文から検索
            </li>
            <li>
              <strong>ハイライト表示</strong>: 検索結果のキーワードが黄色でハイライト
            </li>
            <li>
              <strong>タグサジェスト</strong>: よく使うタグをクリックで即検索
            </li>
            <li>
              <strong>日付フィルター</strong>: 今日/今週/今月/全期間で絞り込み
            </li>
            <li>
              <strong>並び替え</strong>: 更新日時やタイトルで並び替え可能
            </li>
            <li>
              <strong>メッセージプレビュー</strong>: マッチしたメッセージの一部を表示
            </li>
          </ul>
        </div>

        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
            📦 Vector Storeの保管期間設定
          </h3>
          <p style={{ marginLeft: "1rem", lineHeight: "1.6" }}>
            Vector Store（ファイル検索用のベクトルストア）には保管期間を設定できます:
          </p>
          <ul style={{ marginLeft: "1.5rem", lineHeight: "1.8" }}>
            <li>
              <strong>自動削除</strong>: 最後の利用から指定日数（1～365日）経過後に自動削除
            </li>
            <li>
              <strong>無期限保管</strong>: 手動で削除するまで保持（定期的な見直しを推奨）
            </li>
            <li>
              <strong>既定値</strong>: 7日間の自動削除が設定されています
            </li>
            <li>
              <strong>注意</strong>: 無期限保管は課金が継続します。使用しないVector Storeは削除してください
            </li>
          </ul>
          <p style={{ marginLeft: "1rem", lineHeight: "1.6", marginTop: "0.5rem" }}>
            Vector Stores一覧ページで保管期限を確認できます。期限が近い場合は警告が表示されます。
          </p>
        </div>

        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
            📋 Vector Stores一覧画面の機能
          </h3>
          <p style={{ marginLeft: "1rem", lineHeight: "1.6" }}>
            Vector Stores一覧画面では以下の機能が利用できます:
          </p>
          <ul style={{ marginLeft: "1.5rem", lineHeight: "1.8" }}>
            <li>
              <strong>検索機能</strong>: 名前やIDで検索可能（ツールバー右側）
            </li>
            <li>
              <strong>カラム選択</strong>: 表示する列を自由に選択可能（列選択ボタン）
            </li>
            <li>
              <strong>ソート機能</strong>: カラムヘッダーをクリックして昇順/降順を切り替え
            </li>
            <li>
              <strong>表示項目</strong>: 名前、ID、作成日、最終利用日、ファイル数、保管期限、期限日時
            </li>
            <li>
              <strong>期限表示</strong>: 「○日後」「明日期限」「期限切れ」など分かりやすく表示
            </li>
            <li>
              <strong>お気に入り機能</strong>: ★マークで重要なVector Storeを管理（お気に入り登録したVector Storeは削除が防止されます）
            </li>
            <li>
              <strong>同期機能</strong>: 「更新」ボタンでOpenAIと同期
            </li>
            <li>
              <strong>ファイル管理</strong>: Vector Store名をクリックするとファイルアップロード画面へ移動
            </li>
          </ul>
        </div>
      </section>

      <section className="section-card">
        <div className="section-card-title">🚨 トラブルシューティング</div>

        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
            エラーが発生した場合
          </h3>
          <p style={{ marginLeft: "1rem", lineHeight: "1.6" }}>
            予期せぬエラーが発生した場合、以下の手順で対処できます:
          </p>
          <ol style={{ marginLeft: "2rem", lineHeight: "1.8" }}>
            <li>設定画面（⚙️）を開く</li>
            <li>「🚨 詳細エラーログ（開発者向け）」セクションまでスクロール</li>
            <li>「ログをエクスポート」ボタンをクリック</li>
            <li>ダウンロードされたJSONファイルを開発者に送信</li>
          </ol>
          <p style={{ marginLeft: "1rem", marginTop: "0.5rem", lineHeight: "1.6", fontSize: "0.9rem", color: "#888" }}>
            ※ エクスポートされたログには、APIキーなどの機密情報は含まれません（自動的に削除されます）
          </p>
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
            接続できない場合
          </h3>
          <p style={{ marginLeft: "1rem", lineHeight: "1.6" }}>
            設定画面の「接続状況ログ」を確認してください:
          </p>
          <ul style={{ marginLeft: "1.5rem", lineHeight: "1.8" }}>
            <li>APIキーが正しく入力されているか</li>
            <li>インターネット接続があるか</li>
            <li>OpenAI APIのステータス（障害が発生していないか）</li>
          </ul>
        </div>

        <div>
          <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "0.5rem" }}>
            デバッグモード
          </h3>
          <p style={{ marginLeft: "1rem", lineHeight: "1.6" }}>
            設定画面の「🧪 テストエラーを生成」ボタンで、エラーログ機能をテストできます。
            正常に動作しているか確認したい場合にご利用ください。
          </p>
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
