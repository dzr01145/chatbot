# 労働安全衛生サポートチャット

労働安全衛生に関する質問に答えるAI搭載チャットボット

## 特徴

- 🤖 **Gemini AI統合**: Google AI Studio (Gemini) を使用した高品質な応答
- 📱 **モバイルファースト設計**: 携帯電話で全幅表示、小さいフォントサイズ
- 💬 **シンプルなUI**: ナレッジ管理パネルなし、チャット機能に集中
- 🎨 **レスポンシブデザイン**: 携帯・タブレット・PC対応
- 📚 **ナレッジベース**: 労働安全衛生に関する知識を自動参照
- ⚡ **軽量で高速**: 最適化されたパフォーマンス

## セットアップ

### 1. 環境変数の設定

```bash
# .env.exampleをコピー
cp .env.example .env

# .envファイルを編集してAPIキーを設定
```

`.env` ファイル:
```
AI_PROVIDER=google
GOOGLE_API_KEY=your_google_api_key_here
```

### 2. Google API キーの取得

1. [Google AI Studio](https://aistudio.google.com/app/apikey) にアクセス
2. 「Create API Key」をクリック
3. APIキーをコピーして `.env` ファイルに貼り付け

### 3. 依存関係のインストール

```bash
npm install
```

### 4. サーバーの起動

```bash
# 本番環境
npm start

# 開発環境（自動リロード）
npm run dev
```

サーバーは `http://localhost:3000` で起動します。

## モバイル最適化

- **タイトル**: 16px（携帯）/ 22px（タブレット以上）
- **サブタイトル**: 11px（携帯）/ 14px（タブレット以上）
- **メッセージ**: 14px（携帯）/ 15px（タブレット以上）
- **画面幅**: 携帯では100%、タブレット以上では最大800px
- **パディング**: 最小化して表示領域を最大化

## Renderへのデプロイ

### 方法1: Blueprint（推奨）

1. [Render Dashboard](https://dashboard.render.com/) にログイン
2. 「New」→「Blueprint」を選択
3. GitHubリポジトリを接続
4. ブランチを選択（`claude/mobile-chat-layout-011CUV8GJhuZECRxVszMawEd`）
5. 環境変数を設定：
   - `GOOGLE_API_KEY`: あなたのGoogle APIキー
   - `AI_PROVIDER`: `google`
   - `BASIC_AUTH_USER`: （オプション）パスワード保護用
   - `BASIC_AUTH_PASSWORD`: （オプション）パスワード保護用
6. 「Apply」をクリック

### 方法2: 手動設定

1. 「New」→「Web Service」を選択
2. リポジトリを接続
3. 設定:
   - **Name**: `safety-chatbot`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. 環境変数を追加（上記と同じ）
5. 「Create Web Service」をクリック

## ファイル構成

```
chatbot/
├── src/
│   └── server.js          # Express サーバー & AI統合
├── public/
│   ├── index.html         # モバイル最適化UI
│   ├── style.css          # レスポンシブスタイル
│   └── script.js          # API連携フロントエンド
├── data/
│   └── knowledge.json     # ナレッジベース
├── package.json           # Node.js依存関係
├── render.yaml            # Renderデプロイ設定
├── .env.example           # 環境変数テンプレート
└── README.md              # このファイル
```

## API仕様

### POST /api/chat

チャットメッセージを送信

**リクエスト:**
```json
{
  "message": "労働安全衛生法とは何ですか？",
  "conversationHistory": []
}
```

**レスポンス:**
```json
{
  "reply": "労働安全衛生法は...",
  "knowledgeUsed": true,
  "knowledgeCount": 3,
  "provider": "google"
}
```

### GET /api/health

サーバーとAPI設定の状態確認

## ライセンス

MIT
