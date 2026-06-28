# Usage Meter (Desktop)

Claude と Codex の使用量を読み取り、**タスクトレイ常駐・常時最前面・透明HUD風**のメーター窓に表示する Electron デスクトップアプリです。Chrome拡張ではできなかった「ブラウザ非依存・常に最前面・ウィンドウ透過」を実現します。

Chrome拡張版（Claude Usage Meter / Codex Usage Meter）の解析ロジック（`usageParser`）をそのまま流用しています。

## 仕組み

- アプリ内の**隠しウィンドウ**で Claude/Codex の使用量ページを開き、`innerText` を取得して解析します（内部APIや外部サーバーには接続しません）。
- 取得した値とリセット時刻を、メーター窓とトレイのツールチップに表示します。
- データは `chrome.storage` ではなく、ユーザーデータ領域の `state.json`（`app.getPath('userData')`）にだけ保存します。

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
- **メーター窓**：HUD部分をドラッグで移動、ホバー時に表示される `⟳` で再取得、`×` でトレイにしまう
- **トレイメニュー**：再取得 / 透明度(100〜50%) / 常に最前面 / 週間ペースの計算(7日間・平日5日) / 自動更新間隔(1〜60分) / 対象サービス(Claude・Codex) / 各ログイン / 起動時に自動起動 / 終了

## 表示内容

- **Claude**：ログイン済みの場合だけ、現在のセッション・週間制限の「残り%」＋リセットを表示
- **Codex**：5時間の使用制限・週間利用上限の「残り%」＋リセット、ターン数などの合計値を表示
- HUD上では、各サービスの制限枠を細いゲージとして表示します。

## パッケージング

### Mac（`.app` / `.dmg`）

Apple Silicon搭載Macで実行します。

```sh
npm run dist:mac
```

`dist/mac-arm64/Usage Meter.app` と、インストール用の
`dist/Usage Meter-1.0.0-arm64.dmg` が生成されます。

`dist:mac` は自分のMacで使うための署名なしビルドです。初回起動時にmacOSの警告が出る場合は、Finderでアプリを右クリックし、「開く」を選びます。

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
```

アイコン再生成:

```sh
npm run icons
```

## 制約・注意

- Claude/Codex の DOM や表示文言が変わると取得できなくなる場合があります（ラベル文言に依存）。
- 値の取得は対象ページを隠しウィンドウで読めたときだけ更新されます。ログインが切れると「未ログイン」と表示し、ログインを促します。
- サイト側のボット対策により、Electron 内での読み込みがブロックされる可能性があります（その場合はログイン窓での手動読み込み後に再取得を試してください）。
- Codex の「使用状況の内訳」等のグラフ（SVG）の日次数値は取得できません（合計値のみ）。
