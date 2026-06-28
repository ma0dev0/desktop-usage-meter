const assert = require('assert').strict;
const {
  parseResetAt,
  classifyPace,
  weekdayDurationBetween,
  getSessionInfo,
  getWeeklyInfo
} = require('../renderer/usagePace');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('ok   -', name);
  } catch (err) {
    console.error('FAIL -', name);
    console.error(err);
    process.exitCode = 1;
  }
}

const capturedAt = new Date('2026-06-19T17:48:00+09:00').getTime();

test('相対時刻と時計表記をリセット日時へ変換', () => {
  assert.equal(
    parseResetAt('4時間19分後にリセット', capturedAt),
    new Date('2026-06-19T22:07:00+09:00').getTime()
  );
  assert.equal(
    parseResetAt('リセット：22:07', capturedAt),
    new Date('2026-06-19T22:07:00+09:00').getTime()
  );
});

test('日付と曜日表記を週間リセット日時へ変換', () => {
  assert.equal(
    parseResetAt('リセット：2026/06/26 11:19', capturedAt),
    new Date('2026-06-26T11:19:00+09:00').getTime()
  );
  assert.equal(
    parseResetAt('18:59 (木)にリセット', capturedAt, { allowClock: false }),
    new Date('2026-06-25T18:59:00+09:00').getTime()
  );
});

test('2.5時間で50%以上なら速いペース', () => {
  assert.equal(classifyPace(50, 2.5 * 60 * 60 * 1000).kind, 'fast');
  assert.equal(classifyPace(51, 2.5 * 60 * 60 * 1000).kind, 'fast');
});

test('終了時予測が140%以上なら非常に速い', () => {
  assert.equal(classifyPace(75, 2.5 * 60 * 60 * 1000).kind, 'very-fast');
});

test('終了時予測が85%以上100%未満ならやや速い', () => {
  const pace = classifyPace(45, 2.5 * 60 * 60 * 1000);
  assert.equal(pace.kind, 'slightly-fast');
  assert.equal(pace.projected, 90);
});

test('終了時予測が60%以上85%未満なら標準', () => {
  const pace = classifyPace(35, 2.5 * 60 * 60 * 1000);
  assert.equal(pace.kind, 'steady');
  assert.equal(pace.projected, 70);
});

test('終了時予測が60%未満なら余裕', () => {
  assert.equal(classifyPace(20, 2.5 * 60 * 60 * 1000).kind, 'relaxed');
});

test('100%使用済みなら上限到達', () => {
  assert.equal(classifyPace(100, 4 * 60 * 60 * 1000).kind, 'exhausted');
});

test('開始直後の少量使用は判定中', () => {
  assert.equal(classifyPace(3, 10 * 60 * 1000).kind, 'pending');
});

test('リセット表示を時刻と残り時間に統一', () => {
  const info = getSessionInfo(
    { percentUsed: 31, resetText: '4時間19分後にリセット' },
    capturedAt,
    capturedAt
  );
  assert.equal(info.resetLabel, '22:07にリセット（あと4時間19分）');
  assert.equal(info.expectedUsed, 14);
  assert.equal(info.pace.kind, 'very-fast');
});

test('週間の経過率から目安線とペースを算出', () => {
  const weeklyCapturedAt = new Date('2026-06-22T11:19:00+09:00').getTime();
  const info = getWeeklyInfo(
    { percentUsed: 50, resetText: 'リセット：2026/06/26 11:19' },
    weeklyCapturedAt,
    weeklyCapturedAt
  );
  assert.equal(info.expectedUsed, 43);
  assert.equal(info.pace.kind, 'fast');
  assert.equal(info.pace.projected, 117);
});

test('週間の開始12時間以内で使用10%未満なら判定中', () => {
  const resetAt = new Date('2026-06-26T11:19:00+09:00').getTime();
  const early = resetAt - (7 * 24 * 60 * 60 * 1000) + (8 * 60 * 60 * 1000);
  const info = getWeeklyInfo(
    { percentUsed: 5, resetText: 'リセット：2026/06/26 11:19' },
    early,
    early
  );
  assert.equal(info.expectedUsed, 5);
  assert.equal(info.pace.kind, 'pending');
});

test('平日5日モードでは土日に目安線が進まない', () => {
  const resetText = 'リセット：2026/06/26 11:19';
  const saturday = new Date('2026-06-20T12:00:00+09:00').getTime();
  const sunday = new Date('2026-06-21T12:00:00+09:00').getTime();
  const saturdayInfo = getWeeklyInfo(
    { percentUsed: 10, resetText },
    saturday,
    saturday,
    'weekdays'
  );
  const sundayInfo = getWeeklyInfo(
    { percentUsed: 10, resetText },
    sunday,
    sunday,
    'weekdays'
  );
  assert.equal(saturdayInfo.expectedUsed, 11);
  assert.equal(sundayInfo.expectedUsed, 11);
});

test('平日5日モードは稼働時間120時間を100%として計算', () => {
  const start = new Date('2026-06-19T11:19:00+09:00').getTime();
  const end = new Date('2026-06-26T11:19:00+09:00').getTime();
  assert.equal(weekdayDurationBetween(start, end), 5 * 24 * 60 * 60 * 1000);

  const monday = new Date('2026-06-22T11:19:00+09:00').getTime();
  const info = getWeeklyInfo(
    { percentUsed: 20, resetText: 'リセット：2026/06/26 11:19' },
    monday,
    monday,
    'weekdays'
  );
  assert.equal(info.expectedUsed, 20);
  assert.equal(info.pace.kind, 'fast');
  assert.equal(info.pace.projected, 100);
});

console.log(`\n${passed} passed`);
