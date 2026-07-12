# 設計メモ

## 方針

BCSFE-Python の内部構造をフロントエンドへ直接露出しない。KBC 側では薄いサービス層を作り、保存データの読込、概要化、許可済み項目の更新、再シリアライズだけを呼び出す。

## フォルダ構成

| パス | 役割 |
|---|---|
| `src/kbc_save_editor/save_service.py` | BCSFE の `SaveFile` を扱う中心処理 |
| `src/kbc_save_editor/bcsfe_runtime.py` | BCSFE の初期化と日本語ロケール同期 |
| `src/kbc_save_editor/bcsfe_update.py` | BCSFE パッケージ更新処理 |
| `src/kbc_save_editor/cli.py` | 起動前更新を挟むCLI入口 |
| `src/kbc_save_editor/models.py` | API とサービス層で使うデータ構造 |
| `src/kbc_save_editor/app.py` | FastAPI の HTTP API |
| `tests/` | 破壊的なセーブ編集を避けた単体テスト |

## 関数の関係

`load_save()` はバイナリから BCSFE の `SaveFile` を作り、`build_summary()` で画面表示向けの概要へ変換する。

`patch_save()` は同じバイナリを再読込し、`validate_changes()` を通した変更だけを setter 経由で反映する。最後に `to_data()` で BCSFE に再シリアライズさせる。

`initialize_bcsfe()` は BCSFE 同梱ファイルの移行、設定初期化、日本語ロケール同期を行う。`save_service.py` の読込処理は、この初期化を通ってから BCSFE を呼ぶ。

BCSFE の設定ファイルは、通常のBCSFE利用と混ざらないように `KBC_BCSFE_CONFIG_DIR` 配下へ分離する。既定ではリポジトリ直下の `.bcsfe/` を使う。

`kbc-save-api` は `cli.py` を入口にし、`KBC_SAVE_EDITOR_AUTO_UPDATE_BCSFE=1` のときだけ `pip install -U bcsfe` を先に実行する。更新後のBCSFEを同じプロセスで読むため、アプリ本体のimportより前に更新処理を置く。

## MVPで扱う項目

- `xp`
- `catfood`
- `normal_tickets`
- `rare_tickets`
- `platinum_tickets`
- `legend_tickets`
- `platinum_shards`
- `np`
- `leadership`

## 注意点

- ユーザーのセーブデータをサーバーに永続保存しない。
- BCSFE の内部 API 変更に備え、依存する関数名を `EDITABLE_FIELDS` に集約する。
- BCSFE の破壊的変更に備え、メジャーバージョンは `<4` に抑える。
- ゲームサーバーへのアップロードは MVP に含めない。
