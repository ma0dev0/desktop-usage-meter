const assert = require('assert');
const { shouldDisplayProvider } = require('../src/providerVisibility');

function test(name, fn) {
  try {
    fn();
    console.log('\u2713', name);
  } catch (error) {
    console.error('\u2717', name);
    throw error;
  }
}

test('Claude: 未ログインなら表示しない', () => {
  assert.strictEqual(
    shouldDisplayProvider({ id: 'claude', enabled: true }, { loggedIn: false }),
    false
  );
});

test('Claude: ログイン済みなら表示する', () => {
  assert.strictEqual(
    shouldDisplayProvider({ id: 'claude', enabled: true }, { loggedIn: true }),
    true
  );
});

test('Codex: Claude と異なり未ログインでも従来どおり表示する', () => {
  assert.strictEqual(
    shouldDisplayProvider({ id: 'codex', enabled: true }, { loggedIn: false }),
    true
  );
});

test('無効にしたサービスはログイン状態にかかわらず表示しない', () => {
  assert.strictEqual(
    shouldDisplayProvider({ id: 'codex', enabled: false }, { loggedIn: true }),
    false
  );
});
