const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/engine.js');
const known = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
  .split('')
  .map(Number);
const solution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
  .split('')
  .map(Number);
function seeded(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
test('Solves a known puzzle and recognizes exactly one solution', () => {
  const before = known.slice();
  const result = S.solve(known);
  assert.equal(result.count, 1);
  assert.deepEqual(result.solution, solution);
  assert.deepEqual(known, before);
  assert.equal(S.complete(solution), true);
  assert.equal(S.complete(known), false);
});
test('Reports row, column, and box conflicts with both affected cells', () => {
  for (const [a, b, type] of [
    [0, 8, '行'],
    [0, 72, '列'],
    [0, 10, '宫'],
  ]) {
    const board = Array(81).fill(0);
    board[a] = board[b] = 7;
    const result = S.conflicts(board);
    assert.deepEqual(
      result.cells.sort((a, b) => a - b),
      [a, b],
    );
    assert.ok(result.details.some((d) => d.type === type && d.digit === 7));
    assert.equal(S.solve(board).count, 0);
    board[b] = 0;
    assert.equal(S.conflicts(board).cells.length, 0);
  }
});
test('Notes toggle, multiple notes coexist, erase works, and givens are protected', () => {
  const state = {
    puzzle: known.slice(),
    board: known.slice(),
    notes: Array.from({ length: 81 }, () => []),
  };
  assert.equal(S.enter(state, 0, 1, false), false);
  assert.equal(S.erase(state, 0), false);
  S.enter(state, 2, 1, true);
  S.enter(state, 2, 4, true);
  assert.deepEqual(state.notes[2], [1, 4]);
  assert.equal(state.board[2], 0);
  S.enter(state, 2, 1, true);
  assert.deepEqual(state.notes[2], [4]);
  assert.equal(S.erase(state, 2), true);
  assert.deepEqual(state.notes[2], []);
  S.enter(state, 2, 4, false);
  assert.equal(state.board[2], 4);
  assert.equal(S.enter(state, 2, 1, true), false);
  S.erase(state, 2);
  assert.equal(state.board[2], 0);
});
test('Entering a value removes matching notes only from peers', () => {
  const state = {
    puzzle: Array(81).fill(0),
    board: Array(81).fill(0),
    notes: Array.from({ length: 81 }, () => [2, 4]),
  };
  S.enter(state, 0, 4, false);
  assert.deepEqual(state.notes[0], []);
  for (const i of S.peers[0]) assert.deepEqual(state.notes[i], [2]);
  assert.deepEqual(state.notes[40], [2, 4]);
});
test('All three difficulty levels produce distinct, valid, unique puzzles', () => {
  for (const [level, target] of [
    ['easy', 42],
    ['medium', 34],
    ['hard', 28],
  ]) {
    const signatures = new Set();
    for (let seed = 1; seed <= 8; seed++) {
      const game = S.generate(level, seeded(seed));
      assert.equal(S.complete(game.solution), true);
      assert.equal(game.puzzle.filter(Boolean).length >= target, true);
      assert.equal(game.puzzle.filter(Boolean).length <= 45, true);
      assert.ok(game.puzzle.every((n, i) => !n || n === game.solution[i]));
      const solved = S.solve(game.puzzle);
      assert.equal(solved.count, 1, `${level} seed ${seed}`);
      assert.deepEqual(solved.solution, game.solution);
      signatures.add(game.puzzle.join(''));
    }
    assert.equal(signatures.size, 8);
  }
});
test('Rejects invalid input and detects a non-unique puzzle', () => {
  assert.equal(S.solve([0]).count, 0);
  assert.equal(S.solve(Array(81).fill(10)).count, 0);
  assert.equal(S.solve(Array(81).fill(0)).count, 2);
  const state = {
    puzzle: Array(81).fill(0),
    board: Array(81).fill(0),
    notes: Array.from({ length: 81 }, () => []),
  };
  for (const digit of [0, 10, NaN, 1.5]) assert.equal(S.enter(state, 0, digit, false), false);
  for (const index of [-1, 81, 1.5]) assert.equal(S.enter(state, index, 1, false), false);
});
test('Every one of the 1080 numbered boards has exactly one solution', () => {
  for (const size of [6, 9, 16]) {
    const engine = S.create(size),
      signatures = new Set();
    assert.equal(engine.units.length, size * 3);
    for (const unit of engine.units) assert.equal(unit.cells.length, size);
    for (const [levelIndex, level] of ['easy', 'medium', 'hard'].entries()) {
      for (let stage = 1; stage <= 120; stage++) {
        const seed = (stage * 2654435761 + size * 10007 + levelIndex * 998244353) >>> 0;
        const game = engine.generate(level, S.seeded(seed));
        assert.equal(game.puzzle.length, size * size);
        // Audit givens independently of the engine's unit and conflict helpers.
        const blockRows = size === 6 ? 2 : size === 9 ? 3 : 4;
        const blockCols = size === 6 ? 3 : size === 9 ? 3 : 4;
        const auditUnits = [];
        for (let r = 0; r < size; r++) auditUnits.push(game.puzzle.slice(r * size, (r + 1) * size));
        for (let c = 0; c < size; c++)
          auditUnits.push(Array.from({ length: size }, (_, r) => game.puzzle[r * size + c]));
        for (let r = 0; r < size; r += blockRows)
          for (let c = 0; c < size; c += blockCols) {
            const unit = [];
            for (let dr = 0; dr < blockRows; dr++)
              for (let dc = 0; dc < blockCols; dc++)
                unit.push(game.puzzle[(r + dr) * size + c + dc]);
            auditUnits.push(unit);
          }
        for (const unit of auditUnits) {
          const givens = unit.filter(Boolean);
          assert.equal(
            new Set(givens).size,
            givens.length,
            `Duplicate givens ${size}/${level}/${stage}`,
          );
        }
        assert.equal(engine.complete(game.solution), true);
        const solved = engine.solve(game.puzzle);
        assert.equal(solved.count, 1, `${size} / ${level} / ${stage}`);
        assert.deepEqual(solved.solution, game.solution);
        const signature = game.puzzle.join(',');
        assert.equal(signatures.has(signature), false, `Duplicate ${size}/${level}/${stage}`);
        signatures.add(signature);
      }
    }
    assert.equal(signatures.size, 360);
  }
});
test('6×6 uses 2×3 blocks and 16×16 handles numbers 10–16 and notes', () => {
  const mini = S.create(6);
  assert.equal(mini.box(0), mini.box(8));
  assert.notEqual(mini.box(0), mini.box(12));
  assert.notEqual(mini.box(0), mini.box(3));
  const engine = S.create(16);
  const state = {
    puzzle: Array(256).fill(0),
    board: Array(256).fill(0),
    notes: Array.from({ length: 256 }, () => []),
  };
  for (let digit = 10; digit <= 16; digit++) engine.enter(state, 0, digit, true);
  assert.deepEqual(state.notes[0], [10, 11, 12, 13, 14, 15, 16]);
  engine.enter(state, 0, 16, false);
  assert.equal(state.board[0], 16);
  assert.deepEqual(state.notes[0], []);
  engine.enter(state, 15, 16, false);
  assert.ok(engine.conflicts(state.board).details.some((d) => d.type === '行' && d.digit === 16));
  engine.erase(state, 15);
  assert.equal(engine.conflicts(state.board).cells.length, 0);
  assert.equal(engine.complete(Array(256).fill(1)), false);
});
