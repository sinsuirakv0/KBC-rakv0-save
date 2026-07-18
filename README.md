# KBC-rakv0-save

KBCローカルツールの最小フロントエンドです。

この公開リポジトリにはHTML、CSS、KBCロゴだけを置きます。セーブ解析、ランキング認証・署名、可読JavaScript、ゲーム素材、解析資料は含みません。

単体では動作しません。隣接するローカル専用の`KBC-rakv0-lab`から起動してください。

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
- `public/assets/kbc-logo.png`: KBCロゴ

ブラウザ用JavaScriptはlocalhostの`/_lab/`から配信されます。
