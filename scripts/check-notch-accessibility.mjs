import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const swiftArgs = [
  'run',
  '--package-path',
  'NotchMeter',
  'NotchMeter',
  '--print-accessibility-summary'
];

const cases = [
  {
    sample: 'notch-status.json',
    expected: ['Usage Meter', 'Claude', 'Codex', '残り', '注意', '5時間', '週間', '目安', '更新']
  },
  {
    sample: 'notch-status-stale.json',
    expected: ['Usage Meter', 'Claude', 'Codex', '残り', '古いデータ']
  },
  {
    sample: 'notch-status-empty.json',
    expected: ['Usage Meter', 'サービスなし']
  },
  {
    sample: 'notch-status-off.json',
    expected: ['Usage Meter', '対象サービスがOFFです', '本体で対象サービスをON']
  },
  {
    sample: 'notch-status-login-required.json',
    expected: ['Usage Meter', 'ログインが必要です', 'Claude', '未ログイン']
  },
  {
    sample: 'notch-status-unavailable.json',
    expected: ['Usage Meter', 'Claude', '未ログイン', 'Codex', '未取得']
  },
  {
    sample: 'notch-status-refreshing.json',
    expected: ['Usage Meter', '取得中', 'Claude', 'Codex', '残り 24%', '5時間', '週間']
  },
  {
    sample: 'notch-status-refresh-error.json',
    expected: ['Usage Meter', 'Codex', '読み込み失敗', '前回値を表示', '残り 24%', '5時間', '週間']
  },
  {
    sample: 'notch-status.json',
    issue: 'missing',
    expected: ['Usage Meter', 'JSON未作成', 'Usage Meter 本体の出力待ち']
  },
  {
    sample: 'notch-status.json',
    issue: 'unreadable',
    expected: ['Usage Meter', 'JSON読み込み失敗', 'JSON形式を確認してください']
  }
];

for (const testCase of cases) {
  const samplePath = path.join(root, 'NotchMeter', 'Samples', testCase.sample);
  const args = testCase.issue
    ? [...swiftArgs, '--preview-issue', testCase.issue]
    : swiftArgs;
  const output = execFileSync('swift', args, {
    cwd: root,
    env: {
      ...process.env,
      USAGE_METER_STATUS_PATH: samplePath
    },
    encoding: 'utf8'
  }).trim();

  for (const expected of testCase.expected) {
    if (!output.includes(expected)) {
      throw new Error(`${testCase.sample}: missing "${expected}" in accessibility summary: ${output}`);
    }
  }

  const label = testCase.issue ? `${testCase.sample} (${testCase.issue})` : testCase.sample;
  console.log(`ok   - ${label}: ${output}`);
}
