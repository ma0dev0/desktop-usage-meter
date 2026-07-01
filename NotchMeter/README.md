# NotchMeter

MacBook のノッチ周辺を、Usage Meter 用の小さなメニューバー風表示として使う Swift/AppKit プロトタイプです。

## 役割

- UsageMeter 本体: Claude / Codex の使用量を取得し、`notch-status.json` に出力します。
- NotchMeter: `notch-status.json` を読み、画面上部中央のノッチ周辺に軽量表示します。

Electron や Tauri でも使用量取得部分は作れますが、ノッチ周辺・Spaces・フルスクリーン・常時前面のような macOS 固有の表示制御は AppKit の方が扱いやすいため、表示だけを Swift 側に分けています。

## 実行

UsageMeter 本体を起動すると、トレイメニューの「NotchMeter（ノッチ表示）」から起動・停止できます。「本体起動時に開く」を有効にすると、次回以降は本体起動に合わせて NotchMeter も開きます。配布版では release ビルド済みの NotchMeter がアプリ内に同梱され、開発中は Swift Package から起動します。起動に失敗した場合は、同じメニューから起動ログをコピーできます。

開発中に単体で実行する場合は、UsageMeter 本体を起動した状態で、リポジトリ直下から実行します。

```sh
swift run --package-path NotchMeter NotchMeter
```

本体が出すJSONをまだ用意していない場合は、サンプルJSONで表示だけ確認できます。

```sh
USAGE_METER_STATUS_PATH="$PWD/NotchMeter/Samples/notch-status.json" \
  swift run --package-path NotchMeter NotchMeter
```

画面取得権限なしで見た目だけ確認したい場合は、サンプルJSONからPNGプレビューを出力できます。

```sh
npm run notch:preview
open /tmp/notchmeter-preview.png
```

背景に重ねた状態や、状態別の確認には次のプレビューも使えます。

```sh
npm run notch:preview:all
npm run notch:preview:backdrop
npm run notch:preview:hover
npm run notch:preview:critical
npm run notch:preview:single
npm run notch:preview:empty
npm run notch:preview:off
npm run notch:preview:stale
npm run notch:preview:unavailable
npm run notch:preview:refreshing
npm run notch:preview:error
npm run notch:preview:missing
npm run notch:preview:unreadable
```

生成済みプレビューがノッチ中央の安全帯を侵食していないか、Claude/Codex の左右ホームポジションが崩れていないか、下段の5時間/週間ミニバーが見えているか、ホバー時に対象カプセルだけ反応するか、未ログイン/未取得/待機/読み込み失敗状態が落ち着いて表示されるかは、次で確認できます。

```sh
npm run notch:preview:check
```

VoiceOver向けの要約が主要情報を含んでいるかは、次で確認できます。

```sh
npm run notch:accessibility:check
```

Swift側のビルドだけを確認する場合は次を使います。

```sh
npm run check:notch
```

## 表示位置

NotchMeter は `NSPanel` を使い、`statusBar` レベルで画面上部中央に置きます。複数ディスプレイ環境では、メイン画面よりもノッチ領域を持つ画面を優先します。ノッチそのものは物理的に表示ピクセルがないため、実際に描画できるのはノッチの左右と周辺です。そのため、このプロトタイプでは左右にサービスアイコンと残量を出します。各サービスの下には横並びの `5h` と `W` ミニバーを出し、5時間制限・週間制限の使用量と現在時刻までの目安線を表示します。アイコン色はサービス識別、残量テキスト・バー色・カプセル枠は状態判定に使います。残量テキストとカプセル枠は最も厳しい制限のペースにも追従するため、残量が多くても消費ペースが速い場合は注意色になります。バー色は単純な使用率だけでなく、目安線に対するペース判定を優先します。再取得中は青い枠と小さなリングを出し、メニューやアクセシビリティ要約にも「取得中」を含めます。表示対象がひとつもないときは、単に待機中にせず「サービスなし」と出します。表示中サービスの `capturedAt` が15分以上古い場合は、JSON自体が新しく書かれていても、値を少し抑えて時計サインを出します。直近の取得に失敗して前回値を表示している場合は、赤い枠と小さな `!` サインで知らせ、メニューやアクセシビリティ要約にも失敗理由を含めます。

クリックすると小さなメニューを開けます。

- 再読み込み
- 状態をコピー
- JSONパスをコピー
- 終了

## JSON形式

UsageMeter 本体は Electron のユーザーデータ領域に `notch-status.json` を出力します。書き込み中の一瞬だけNotchMeterが壊れたJSONを読むことがないよう、本体は一時ファイルへ書いたあと原子的に置き換えます。NotchMeter は次の順でファイルを探します。

1. 環境変数 `USAGE_METER_STATUS_PATH`
2. `~/Library/Application Support/desktop-usage-meter/notch-status.json`
3. `~/Library/Application Support/Usage Meter/notch-status.json`
4. `~/Library/Application Support/DesktopUsageMeter/notch-status.json`

最小の形式は次の通りです。

```json
{
  "schemaVersion": 4,
  "updatedAt": "2026-06-30T12:00:00Z",
  "refreshing": false,
  "weeklyPaceMode": "calendar",
  "providers": [
    {
      "id": "codex",
      "name": "Codex",
      "color": "#3ecf8e",
      "enabled": true,
      "visible": true,
      "loggedIn": true,
      "percentRemaining": 24,
      "percentUsed": 76,
      "capturedAt": "2026-06-30T12:00:00Z",
      "refreshing": false,
      "refreshError": null,
      "limits": [
        {
          "key": "fivehour",
          "label": "5時間",
          "percentUsed": 76,
          "percentRemaining": 24,
          "expectedUsed": 20,
          "resetLabel": "01:00にリセット（あと4時間）",
          "pace": { "kind": "very-fast", "label": "非常に速い", "projected": 228 }
        },
        {
          "key": "weekly",
          "label": "週間",
          "percentUsed": 41,
          "percentRemaining": 59,
          "expectedUsed": 32,
          "resetLabel": "11:00にリセット（あと2日）",
          "pace": { "kind": "slightly-fast", "label": "やや速い", "projected": 94 }
        }
      ]
    }
  ]
}
```
