# Usage Meter Wear OS

Pixel Watch 2向けのMVPアプリです。Mac版Usage MeterがCloudflare Workerへ送った最新JSONをHTTPSで取得し、Codex/Claudeの使用量を1画面に表示します。

## セットアップ

1. Android Studioでこの`wear/`ディレクトリを開きます。
2. `local.properties.example`を参考に、`wear/local.properties`を作成します。

```properties
usageMeter.apiUrl=https://usage-meter-api.example.workers.dev/usage
usageMeter.apiKey=replace-with-the-same-key-as-worker
```

`local.properties`は`.gitignore`済みです。APIキーを公開リポジトリへ入れないでください。

## MVP仕様

- 起動時に`GET /usage`で最新データを取得
- 画面右上の更新ボタンで手動更新
- 取得成功時は時計側にJSONをキャッシュ
- 通信失敗時は前回キャッシュを表示したまま「更新失敗」を表示
- 初回かつキャッシュなしの場合だけ「データを取得できませんでした」を表示

## コンプリケーション

ウォッチフェイスのユーティリティ枠から、次のデータソースを選べます。

- `Usage Meter: Codex 5h`
- `Usage Meter: Claude`
- `Usage Meter: Critical`

ゲージ対応枠では `RANGED_VALUE` として使用率バーを表示し、非対応枠では短い `%` 表示になります。タップするとUsage Meterアプリを開きます。更新間隔はWear OSの制約に合わせて5分です。

## 実機確認

Pixel Watch 2をAndroid Studioに接続し、`app`構成を実行します。バックグラウンド更新、通知、タイル、コンプリケーションはMVP対象外です。

CLIで確認する場合:

```sh
cd wear
./gradlew :app:assembleDebug
```

デバッグAPKは `wear/app/build/outputs/apk/debug/app-debug.apk` に生成されます。
