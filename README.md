# Usage Meter (Desktop)

[![CI](https://github.com/ma0dev0/desktop-usage-meter/actions/workflows/ci.yml/badge.svg)](https://github.com/ma0dev0/desktop-usage-meter/actions/workflows/ci.yml)

Claude と Codex の使用量を読み取り、**タスクトレイ常駐・常時最前面・透明HUD風**のメーター窓に表示する Electron デスクトップアプリです。Chrome拡張ではできなかった「ブラウザ非依存・常に最前面・ウィンドウ透過」を実現します。

<img width="320" height="185" alt="image" src="https://github.com/user-attachments/assets/05b85b2d-7318-4454-9969-d1c5478a4ae9" />

## NotchMeter（Swift/AppKit試作）

MacBook のノッチ周辺をメニューバーのように使う表示だけは、`NotchMeter/` に Swift/AppKit の軽量アプリとして分けています。

- UsageMeter 本体：使用量を取得し、Electron のユーザーデータ領域へ `notch-status.json` を出力
- NotchMeter：`notch-status.json` を読み、ノッチ左右にサービスアイコン＋残量%＋5時間/週間ミニバーを出す

Usage Meter 本体を起動すると、トレイメニューの「NotchMeter（ノッチ表示）」から起動・停止できます。「本体起動時に開く」を有効にすると、次回以降は本体起動に合わせて NotchMeter も開きます。配布版では release ビルド済みの NotchMeter を同梱し、開発中は Swift Package から起動します。

単体で試す場合:

```sh
swift run --package-path NotchMeter NotchMeter
```

本体なしで表示だけ確認する場合:

```sh
USAGE_METER_STATUS_PATH="$PWD/NotchMeter/Samples/notch-status.json" \
  swift run --package-path NotchMeter NotchMeter
```

詳しくは [NotchMeter/README.md](NotchMeter/README.md) を見てください。

## Wear OS MVP（Pixel Watch 2）

`wear/` にPixel Watch 2向けのJetpack Compose for Wear OSアプリを追加しています。時計アプリはCloudflare Worker等のHTTPS APIから最新JSONを取得し、Codex/Claudeの5時間・週間使用量、リセットまでの時間、最終更新を1画面に表示します。

構成:

- Usage Meter本体：`wear-status.json`をユーザーデータ領域へ出力し、設定があればAPIへPOST
- API Worker：`api/cloudflare-worker/` の `GET /usage` / `POST /usage`
- Wear OSアプリ：`wear/` をAndroid Studioで開いてPixel Watch 2へ実行

Mac側のAPI送信設定は、APIキーをリポジトリへ含めないためユーザーデータ領域の `wear-sync.json` か環境変数で行います。トレイメニューの「Wear OS同期」から設定ファイルパスと時計用JSONパスをコピーできます。

`wear-sync.json` の例:

```json
{
  "enabled": true,
  "endpointUrl": "https://usage-meter-api.example.workers.dev/usage",
  "apiKey": "replace-with-worker-secret"
}
```

環境変数で設定する場合:

```sh
USAGE_METER_WEAR_API_URL="https://usage-meter-api.example.workers.dev/usage" \
USAGE_METER_WEAR_API_KEY="replace-with-worker-secret" \
npm start
```

時計側は `wear/local.properties.example` を参考に `wear/local.properties` を作成します。このファイルは `.gitignore` 済みです。

## 仕組み

- アプリ内の**隠しウィンドウ**で Claude/Codex の使用量ページを開き、`innerText` を取得して解析します（内部APIや外部サーバーには接続しません）。
- 取得した値とリセット時刻を、メーター窓とトレイのツールチップに表示します。
- Swift/AppKit版の `NotchMeter` 用に、表示専用JSON `notch-status.json` も出力します。書き込み中の一瞬だけ壊れたJSONを読ませないよう、一時ファイルから原子的に置き換えます。
- Wear OS版の表示用に、同じユーザーデータ領域へ `wear-status.json` も出力します。`wear-sync.json` または環境変数でAPI URL/APIキーが設定されている場合だけ、そのJSONをHTTPS APIへ送信します。
- データ本体は `chrome.storage` ではなく、ユーザーデータ領域の `state.json`（`app.getPath('userData')`）に保存します。表示連携用の軽いJSONとして、同じ領域の `notch-status.json` と `wear-status.json` にも出力します。

### ログインについて（重要）

使用量はログイン済みセッションでしか見えません。本アプリは **`persist:` パーティション**でセッションを保持します。

1. トレイメニューの「Claude にログイン」「Codex にログイン」を押すと、アプリ内ブラウザでそのページが開きます。
2. 一度ログインすれば、以降は隠しウィンドウでの取得が成功します（セッションは保持されます）。

## 必要環境

- **Node.js 18 以降**（Electron のため。この環境の Node 12 では実行できません）
- macOS（Apple Silicon）または Windows 10/11

## 実行

```sh
npm install      # 初回のみ（electron をダウンロード）
npm start        # アプリ起動
```

起動するとトレイにアイコンが常駐します。

- **トレイ左クリック**：メーター窓の表示/非表示
- **ショートカット**：`Command / Ctrl + Shift + U` でメーター窓の表示/非表示を切り替え
- **メーター窓**：HUD部分をドラッグで移動、ホバー時に表示される `⟳` で再取得、`×` でトレイにしまう
- **トレイメニュー**：NotchMeter（ノッチ表示）の起動・停止 / 再取得 / 現在の状態をコピー / 透明度(100〜50%) / 常に最前面 / しきい値通知 / 週間ペースの計算(7日間・平日5日) / 自動更新間隔(1〜60分) / 対象サービス(Claude・Codex) / 各ログイン / 起動時に自動起動 / 終了

## 表示内容

- **Claude**：ログイン済みの場合だけ、現在のセッション・週間制限の「残り%」＋リセットを表示
- **Codex**：5時間の使用制限・週間利用上限の「残り%」＋リセット、ターン数などの合計値を表示
- HUD上では、各サービスの制限枠を細いゲージとして表示します。
- 使用量が 80% / 90% / 95% に到達したとき、5時間枠のリセットまで30分 / 10分になったとき、取得失敗や古いデータが続くときにデスクトップ通知で知らせます。
- **NotchMeter**：ノッチ左右にサービスアイコンと残量%を置き、その下に5時間・週間の横並びミニバー、現在時刻までの目安線、ペース判定色、取得中の青いリング、古いデータの時計サイン、取得失敗時の小さな赤いサインを表示します。

## パッケージング

### Mac（`.app` / `.dmg`）

Apple Silicon搭載Macで実行します。

```sh
npm run dist:mac
```

`dist/mac-arm64/Usage Meter.app` と、インストール用の
`dist/Usage Meter-1.0.0-arm64.dmg` が生成されます。

`dist:mac` は自分のMacで使うための署名なしビルドです。初回起動時にmacOSの警告が出る場合は、Finderでアプリを右クリックし、「開く」を選びます。Mac版は `npm run notch:build:release` を先に実行し、NotchMeter の実行ファイルをアプリの `Resources/NotchMeter/` に同梱します。

Apple Developer証明書を設定済みの環境では、次のコマンドで署名付きビルドを作成できます。

```sh
npm run dist:mac:signed
```

他の人へ一般配布する場合は、配布用のDeveloper ID Application証明書による署名に加え、Appleの公証も必要です。

### Windows（`.exe`）

```sh
npm run dist:win     # electron-builder で NSIS インストーラを生成
```

`package.json` の `build` を編集すればアプリ名やアイコンを調整できます。署名なしの場合、Windows SmartScreen の警告が出ることがあります。

## ファイル構成

```text
.
├── main.js              メインプロセス（隠しウィンドウ取得・トレイ・メーター窓・IPC・保存）
├── preload.js           レンダラへの API 公開（contextBridge）
├── src
│   ├── claudeParser.js  Claude 解析（CommonJS。拡張版ロジックの移植）
│   ├── codexParser.js   Codex 解析（CommonJS）
│   └── providers.js     対象サービス定義
├── renderer
│   ├── meter.html / meter.js / meter.css   常時最前面・透過のメーター窓
├── scripts/generate-icons.mjs
├── icons/               16〜1024px
├── tests
│   ├── claudeParser.test.js
│   ├── codexParser.test.js
│   ├── providerVisibility.test.js
│   └── usagePace.test.js
└── README.md
```

## 開発確認

解析ロジックのテストと構文チェックは Electron なしで実行できます。

```sh
npm test
npm run check
npm run notch:verify
```

`notch:verify` は Swift ビルド、NotchMeter の全プレビュー生成、画像回帰チェック、アクセシビリティ要約チェックをまとめて実行します。個別に確認したい場合は `npm run check:notch`、`npm run notch:preview:all`、`npm run notch:preview:check`、`npm run notch:accessibility:check` を使えます。

アイコン再生成:

```sh
npm run icons
```

## 制約・注意

- Claude/Codex の DOM や表示文言が変わると取得できなくなる場合があります（ラベル文言に依存）。
- 値の取得は対象ページを隠しウィンドウで読めたときだけ更新されます。ログインが切れると「未ログイン」と表示し、ログインを促します。
- サイト側のボット対策により、Electron 内での読み込みがブロックされる可能性があります（その場合はログイン窓での手動読み込み後に再取得を試してください）。
- Codex の「使用状況の内訳」等のグラフ（SVG）の日次数値は取得できません（合計値のみ）。
