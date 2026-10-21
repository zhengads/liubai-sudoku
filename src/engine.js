(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Sudoku = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const configs = {
    6: {
      size: 6,
      boxRows: 2,
      boxCols: 3,
      label: '迷你',
      clues: { easy: 20, medium: 16, hard: 14 },
    },
    9: {
      size: 9,
      boxRows: 3,
      boxCols: 3,
      label: '经典',
      clues: { easy: 42, medium: 34, hard: 28 },
    },
    16: {
      size: 16,
      boxRows: 4,
      boxCols: 4,
      label: '大棋盘',
      clues: { easy: 168, medium: 152, hard: 136 },
    },
  };
  const cache = new Map();
  function seeded(seed) {
    return () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }
  function shuffle(items, random) {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function create(size = 9) {
    if (!configs[size]) throw new RangeError('Unsupported board size');
    if (cache.has(size)) return cache.get(size);
    const config = configs[size],
      { boxRows, boxCols } = config,
      length = size * size;
    const range = (n) => Array.from({ length: n }, (_, i) => i);
    const row = (i) => Math.floor(i / size),
      col = (i) => i % size;
    const box = (i) =>
      Math.floor(row(i) / boxRows) * (size / boxCols) + Math.floor(col(i) / boxCols);
    const indices = range(length),
      digits = range(size).map((n) => n + 1);
    const rows = indices.map(row),
      cols = indices.map(col),
      boxes = indices.map(box);
    const peers = indices.map((i) =>
      indices.filter(
        (j) => i !== j && (rows[i] === rows[j] || cols[i] === cols[j] || boxes[i] === boxes[j]),
      ),
    );
    const units = ['行', '列', '宫'].flatMap((type, k) =>
      range(size).map((n) => ({
        type,
        number: n + 1,
        cells: indices.filter((i) => [rows, cols, boxes][k][i] === n),
      })),
    );
    const validGrid = (board) =>
      Array.isArray(board) &&
      board.length === length &&
      board.every((n) => Number.isInteger(n) && n >= 0 && n <= size);
    function candidates(board, i) {
      if (board[i]) return [];
      const used = new Set(peers[i].map((j) => board[j]));
      return digits.filter((n) => !used.has(n));
    }
    function conflicts(board) {
      const cells = new Set(),
        details = [];
      for (const unit of units) {
        const seen = new Map();
        for (const i of unit.cells) {
          const n = board[i];
          if (!n) continue;
          if (!seen.has(n)) seen.set(n, []);
          seen.get(n).push(i);
        }
        for (const [digit, duplicates] of seen)
          if (duplicates.length > 1) {
            duplicates.forEach((i) => cells.add(i));
            details.push({ type: unit.type, number: unit.number, digit });
          }
      }
      return { cells: [...cells], details };
    }
    function solve(board, limit = 2) {
      if (!validGrid(board) || !Number.isInteger(limit) || limit < 1)
        return { count: 0, solution: null };
      const work = board.slice(),
        rowMasks = new Int32Array(size),
        colMasks = new Int32Array(size),
        boxMasks = new Int32Array(size);
      const full = (1 << size) - 1;
      for (let i = 0; i < length; i++)
        if (work[i]) {
          const bit = 1 << (work[i] - 1),
            r = rows[i],
            c = cols[i],
            b = boxes[i];
          if ((rowMasks[r] | colMasks[c] | boxMasks[b]) & bit) return { count: 0, solution: null };
          rowMasks[r] |= bit;
          colMasks[c] |= bit;
          boxMasks[b] |= bit;
        }
      let count = 0,
        solution = null;
      function search() {
        let target = -1,
          options = 0,
          min = size + 1;
        for (let i = 0; i < length; i++)
          if (!work[i]) {
            const choices = full & ~(rowMasks[rows[i]] | colMasks[cols[i]] | boxMasks[boxes[i]]);
            if (!choices) return;
            let bits = choices,
              n = 0;
            while (bits) {
              bits &= bits - 1;
              n++;
            }
            if (n < min) {
              target = i;
              options = choices;
              min = n;
            }
            if (n === 1) break;
          }
        if (target < 0) {
          count++;
          if (!solution) solution = work.slice();
          return;
        }
        const r = rows[target],
          c = cols[target],
          b = boxes[target];
        while (options && count < limit) {
          const bit = options & -options;
          options ^= bit;
          work[target] = 32 - Math.clz32(bit);
          rowMasks[r] |= bit;
          colMasks[c] |= bit;
          boxMasks[b] |= bit;
          search();
          rowMasks[r] ^= bit;
          colMasks[c] ^= bit;
          boxMasks[b] ^= bit;
        }
        work[target] = 0;
      }
      search();
      return { count, solution };
    }
    function generate(level = 'easy', random = Math.random) {
      const target = config.clues[level] || config.clues.easy;
      const ordered = (groups, span) =>
        shuffle(range(groups), random).flatMap((g) =>
          shuffle(range(span), random).map((i) => g * span + i),
        );
      const orderedRows = ordered(size / boxRows, boxRows),
        orderedCols = ordered(size / boxCols, boxCols),
        mapped = shuffle(digits, random);
      const solution = orderedRows.flatMap((r) =>
        orderedCols.map((c) => mapped[(r * boxCols + Math.floor(r / boxRows) + c) % size]),
      );
      const puzzle = solution.slice();
      let clues = length;
      for (const i of shuffle(indices, random)) {
        if (clues <= target) break;
        const value = puzzle[i];
        puzzle[i] = 0;
        if (solve(puzzle).count === 1) clues--;
        else puzzle[i] = value;
      }
      return { puzzle, solution, level, size };
    }
    function enter(state, index, digit, noteMode) {
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= length ||
        state.puzzle[index] ||
        !Number.isInteger(digit) ||
        digit < 1 ||
        digit > size
      )
        return false;
      if (noteMode) {
        if (state.board[index]) return false;
        const notes = state.notes[index],
          found = notes.indexOf(digit);
        if (found < 0) notes.push(digit);
        else notes.splice(found, 1);
        notes.sort((a, b) => a - b);
      } else {
        if (state.board[index] === digit) return false;
        state.board[index] = digit;
        state.notes[index] = [];
        for (const p of peers[index]) state.notes[p] = state.notes[p].filter((n) => n !== digit);
      }
      return true;
    }
    function erase(state, index) {
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= length ||
        state.puzzle[index] ||
        (!state.board[index] && !state.notes[index].length)
      )
        return false;
      state.board[index] = 0;
      state.notes[index] = [];
      return true;
    }
    function complete(board) {
      return validGrid(board) && board.every(Boolean) && !conflicts(board).cells.length;
    }
    function hint(board, puzzle, preferred = -1) {
      if (!validGrid(board) || !validGrid(puzzle)) return null;
      const collision = conflicts(board);
      if (collision.cells.length) {
        const editable = collision.cells.filter((i) => !puzzle[i]);
        const index = editable.includes(preferred) ? preferred : editable[0];
        if (index === undefined) return null;
        const value = board[index];
        const unit = units.find(
          (u) => u.cells.includes(index) && u.cells.some((i) => i !== index && board[i] === value),
        );
        return { kind: 'conflict', index, value, unit: { type: unit.type, number: unit.number } };
      }
      const blanks = indices.filter((i) => !board[i]);
      if (!blanks.length) return null;
      const choices = new Map(blanks.map((i) => [i, candidates(board, i)]));
      function describe(index) {
        const values = (unit) =>
          unit.cells
            .filter((i) => i !== index)
            .map((i) => board[i])
            .filter(Boolean)
            .sort((a, b) => a - b);
        return {
          index,
          candidates: choices.get(index),
          rowValues: values(units[rows[index]]),
          columnValues: values(units[size + cols[index]]),
          boxValues: values(units[size * 2 + boxes[index]]),
        };
      }
      const blocked = blanks.find((i) => choices.get(i).length === 0);
      if (blocked !== undefined) return { kind: 'blocked', ...describe(blocked) };
      const singles = blanks.filter((i) => choices.get(i).length === 1);
      const hidden = [];
      for (const unit of units)
        for (const value of digits) {
          if (unit.cells.some((i) => board[i] === value)) continue;
          const positions = unit.cells.filter((i) => !board[i] && choices.get(i).includes(value));
          if (positions.length === 1) {
            const index = positions[0];
            const exclusions = unit.cells
              .filter((i) => !board[i] && i !== index)
              .map((i) => {
                const blocker = peers[i].find((p) => board[p] === value);
                return {
                  index: i,
                  blocker,
                  relation: row(i) === row(blocker) ? '行' : col(i) === col(blocker) ? '列' : '宫',
                };
              });
            hidden.push({
              kind: 'hidden',
              value,
              unit: { type: unit.type, number: unit.number },
              exclusions,
              ...describe(index),
            });
          }
        }
      if (singles.includes(preferred))
        return { kind: 'single', value: choices.get(preferred)[0], ...describe(preferred) };
      const selectedHidden = hidden.find((h) => h.index === preferred);
      if (selectedHidden) return selectedHidden;
      if (singles.length)
        return { kind: 'single', value: choices.get(singles[0])[0], ...describe(singles[0]) };
      if (hidden.length) return hidden[0];
      const target = blanks.includes(preferred)
        ? preferred
        : blanks.slice().sort((a, b) => choices.get(a).length - choices.get(b).length)[0];
      return { kind: 'candidates', ...describe(target) };
    }
    const api = {
      ...config,
      length,
      row,
      col,
      box,
      peers,
      units,
      candidates,
      conflicts,
      solve,
      generate,
      enter,
      erase,
      complete,
      hint,
    };
    cache.set(size, api);
    return api;
  }
  return { ...create(9), create, configs, seeded };
});
