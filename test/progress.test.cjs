const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/progress.js');
const memory = () => {
  const values = new Map();
  return { getItem: (k) => values.get(k) || null, setItem: (k, v) => values.set(k, v) };
};
const valid = (s) =>
  !!s && Array.isArray(s.board) && Array.isArray(s.notes) && Number.isFinite(s.elapsed);
const game = (stage, size = 9, level = 'easy') => ({
  stage,
  size,
  level,
  board: [0, 4],
  notes: [[1, 3], []],
  elapsed: 83,
  hints: 1,
});
test('Every board and difficulty has a unique global stage number from 1 to 1080', () => {
  const { stageNumber } = require('../src/progress.js');
  const numbers = [];
  for (const size of [6, 9, 16])
    for (const level of ['easy', 'medium', 'hard']) {
      for (let stage = 1; stage <= 120; stage++) numbers.push(stageNumber(size, level, stage));
    }
  assert.deepEqual(
    numbers,
    Array.from({ length: 1080 }, (_, i) => i + 1),
  );
  assert.equal(stageNumber(9, 'easy', 1), 361);
  assert.equal(stageNumber(16, 'hard', 120), 1080);
});
test('Switching stages preserves independent values, notes, time and last-played pointer', () => {
  const storage = memory(),
    store = P.create(storage, valid);
  const first = game(1);
  assert.equal(store.save(first), true);
  first.notes[0].push(9);
  first.board[1] = 8;
  assert.equal(store.stage(9, 'easy', 1).board[1], 4);
  assert.deepEqual(store.stage(9, 'easy', 1).notes[0], [1, 3]);
  const second = game(67, 16, 'hard');
  second.elapsed = 250;
  store.save(second);
  assert.equal(store.last().stage, 67);
  assert.equal(store.stage(9, 'easy', 1).elapsed, 83);
  assert.equal(store.stage(16, 'hard', 67).elapsed, 250);
  const reload = P.create(storage, valid);
  assert.equal(reload.last().size, 16);
  assert.deepEqual(reload.stage(9, 'easy', 1).notes[0], [1, 3]);
  assert.equal(reload.stage(9, 'hard', 1), null);
});
test('Legacy current-game saves migrate without losing a board', () => {
  const storage = memory();
  const legacy = game(1);
  delete legacy.stage;
  delete legacy.size;
  storage.setItem('liubai-sudoku-v1', JSON.stringify(legacy));
  const store = P.create(storage, valid);
  assert.equal(store.last().size, 9);
  assert.equal(store.last().stage, 1);
  assert.deepEqual(store.stage(9, 'easy', 1).notes[0], [1, 3]);
  store.save(store.last());
  store.save(game(2));
  assert.equal(store.stage(9, 'easy', 1).elapsed, 83);
});
test('Corrupt or mismatched saves are ignored and quota failures are reported', () => {
  const storage = memory();
  storage.setItem('liubai-sudoku-v1', '{broken');
  storage.setItem('liubai-slot-9-easy-1', JSON.stringify(game(2)));
  const store = P.create(storage, valid);
  assert.equal(store.last(), null);
  assert.equal(store.stage(9, 'easy', 1), null);
  const failing = P.create(
    {
      getItem() {
        throw Error('Unavailable');
      },
      setItem() {
        throw Error('Quota');
      },
    },
    valid,
  );
  assert.equal(failing.last(), null);
  assert.equal(failing.stage(9, 'easy', 1), null);
  assert.equal(failing.save(game(1)), false);
});
test('QA memory saves are isolated from real progress and from later QA sessions', () => {
  const realStorage = memory(),
    real = P.create(realStorage, valid);
  real.save(game(73));
  const qaStorage = P.memory(),
    qa = P.create(qaStorage, valid);
  qa.save(game(1));
  qaStorage.setItem('liubai-completed', '{"9-easy-1":true}');
  assert.equal(real.last().stage, 73);
  assert.equal(realStorage.getItem('liubai-completed'), null);
  assert.equal(qa.last().stage, 1);
  assert.equal(P.create(P.memory(), valid).last(), null);
});
