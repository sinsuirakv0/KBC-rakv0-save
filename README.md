# KBC-rakv0-save

BCSFE-Python を利用した、KBC 向けのにゃんこ大戦争セーブデータエディタです。

このリポジトリは既存ファイルを引き継がず、`sinsuirakv0/KBC-rakv0-save` のリポジトリだけを再利用して新規に作り直しています。

## 最初の目標

- `SAVE_DATA` を読み込む
- 国コードを自動判定する
- XP、ネコカン、チケット類などの主要数値を表示する
- 許可した数値だけを編集する
- 編集済み `SAVE_DATA` を返す

## セットアップ

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip
python -m pip install -e ".[dev]"
```

## 開発サーバー

```powershell
kbc-save-api
```

既定では `http://127.0.0.1:8010` で起動します。

## BCSFEの更新

BCSFE-Python は更新頻度が高いため、依存関係は `bcsfe>=3.5.2,<4` にしています。

手動で更新する場合:

```powershell
kbc-update-bcsfe
```

起動時に自動更新したい場合は、環境変数を有効にします。

```powershell
$env:KBC_SAVE_EDITOR_AUTO_UPDATE_BCSFE = "1"
kbc-save-api
```

## 日本語ロケール

`D:/KBC/bcsfe-ja-locale` が存在する場合、起動時にBCSFEのローカルデータへ `ja` ロケールとして同期します。

KBC用のBCSFE設定は、通常のBCSFE設定と混ざらないように既定で `.bcsfe/` に保存します。

参照先を変える場合:

```powershell
$env:KBC_BCSFE_JA_LOCALE_PATH = "D:/KBC/bcsfe-ja-locale"
```

## テスト

```powershell
pytest
```

## ライセンス

BCSFE-Python は `GPL-3.0-or-later` です。このプロジェクトも同じく `GPL-3.0-or-later` として扱います。
