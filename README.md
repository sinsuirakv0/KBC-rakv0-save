# KBC-rakv0-save

KBCツールの最小公開フロントエンドです。

この公開リポジトリにはHTML、CSS、KBCロゴだけを置きます。セーブ解析、ランキング認証・署名、可読JavaScript、ゲーム素材、解析資料は含みません。

実行用バックエンドと難読化済みJavaScriptは、非公開`KBC-rakv0-save-app`からVercelへ配備します。

本番URL: <https://kbc-rakv0-save.vercel.app>

ローカル開発では、隣接する`KBC-rakv0-lab`から起動します。

```powershell
cd D:\KBC\KBC-rakv0-lab
.\start-save.ps1
```

起動後に `http://127.0.0.1:8010/` を開きます。

## 公開ファイル

- `index.html`: ツールランチャー
- `public/save-editor.html`: セーブデータエディタのHTML
- `public/nyanko-club-forgery.html`: クラブ偽造のHTML
- `public/nyanko-club-forgery.css`: クラブ偽造のCSS
- `public/ranking.html`: ランキング調査のHTML
- `public/ranking.css`: ランキング調査のCSS
- `public/motion.html`: キャラモーション確認のHTML
- `public/motion.css`: キャラモーション確認のCSS
- `public/kbc-common.css`: `KBC-rakv0`準拠の共通トークン・ヘッダー・カード
- `public/assets/kbc-logo.png`: KBCロゴ

ブラウザ用JavaScriptは実行アプリの`/_lab/`から配信されます。privateキャラ素材はサーバーAPIがGitHubから取得し、GitHub tokenをブラウザへ渡しません。
