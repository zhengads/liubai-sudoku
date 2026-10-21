const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/engine.js');
test('Explains a naked single without filling it or consulting an answer', () => {
  const board = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
    .split('')
    .map(Number);
  const original = board.slice();
  const step = S.hint(board, board.slice(), 40);
  assert.equal(step.kind, 'single');
  assert.equal(step.index, 40);
  assert.equal(step.value, 5);
  assert.deepEqual(step.candidates, [5]);
  assert.deepEqual(board, original);
  assert.equal(board[40], 0);
  assert.ok(step.rowValues.includes(8));
  assert.ok(step.columnValues.includes(9));
});
test('Explains a hidden single using the other positions and their blockers', () => {
  const e = S.create(6),
    board = Array(36).fill(0);
  board[9] = 1;
  board[13] = 1;
  board[26] = 1;
  const step = e.hint(board, board.slice(), 0);
  assert.equal(step.kind, 'hidden');
  assert.equal(step.index, 0);
  assert.equal(step.value, 1);
  assert.deepEqual(step.unit, { type: '行', number: 1 });
  assert.equal(step.candidates.length, 6);
  assert.equal(step.exclusions.length, 5);
  for (const ex of step.exclusions) {
    assert.equal(board[ex.blocker], 1);
    assert.ok(e.peers[ex.index].includes(ex.blocker));
  }
});
test('With no forced move, gives candidates rather than revealing a solution', () => {
  const e = S.create(6),
    board = Array(36).fill(0);
  const step = e.hint(board, board.slice(), 17);
  assert.equal(step.kind, 'candidates');
  assert.equal(step.index, 17);
  assert.deepEqual(step.candidates, [1, 2, 3, 4, 5, 6]);
  assert.equal(step.value, undefined);
  assert.deepEqual(board, Array(36).fill(0));
});
test('Targets a conflicting player entry and detects a cell with no candidates', () => {
  const e = S.create(6),
    puzzle = Array(36).fill(0),
    board = Array(36).fill(0);
  puzzle[0] = board[0] = board[5] = 1;
  const step = e.hint(board, puzzle, 0);
  assert.equal(step.kind, 'conflict');
  assert.equal(step.index, 5);
  const blocked = Array(36).fill(0);
  blocked.splice(0, 6, 0, 2, 3, 4, 5, 6);
  blocked[12] = 1;
  assert.equal(e.conflicts(blocked).cells.length, 0);
  const noCandidate = e.hint(blocked, Array(36).fill(0), 0);
  assert.equal(noCandidate.kind, 'blocked');
  assert.equal(noCandidate.index, 0);
});
