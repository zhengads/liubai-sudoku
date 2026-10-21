(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SudokuProgress = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CURRENT = 'liubai-sudoku-v1';
  const key = (size, level, stage) => `liubai-slot-${size}-${level}-${stage}`;
  // Display numbers are global; existing per-board archive keys stay stable.
  function stageNumber(size, level, stage) {
    return ([6, 9, 16].indexOf(size) * 3 + ['easy', 'medium', 'hard'].indexOf(level)) * 120 + stage;
  }
  function memory() {
    const values = new Map();
    return {
      getItem: (name) => values.get(name) || null,
      setItem: (name, value) => {
        values.set(name, String(value));
      },
    };
  }
  function create(storage, validate) {
    function read(name) {
      try {
        const value = JSON.parse(storage.getItem(name));
        if (!validate(value)) return null;
        return { ...value, size: value.size || 9, stage: value.stage || 1 };
      } catch {
        return null;
      }
    }
    function last() {
      return read(CURRENT);
    }
    function stage(size, level, number) {
      let archived = read(key(size, level, number));
      if (
        archived &&
        (archived.size !== size || archived.level !== level || archived.stage !== number)
      )
        archived = null;
      const recent = last();
      if (
        recent &&
        recent.size === size &&
        recent.level === level &&
        recent.stage === number &&
        (!archived || (recent.savedAt || 0) > (archived.savedAt || 0))
      )
        return recent;
      return archived;
    }
    function save(state) {
      const text = JSON.stringify({ ...state, savedAt: Date.now() });
      let success = true;
      try {
        storage.setItem(key(state.size || 9, state.level, state.stage || 1), text);
      } catch {
        success = false;
      }
      // Keep the existing current-game key readable, including in older copies.
      try {
        storage.setItem(CURRENT, text);
      } catch {
        success = false;
      }
      return success;
    }
    return { last, stage, save };
  }
  return { create, memory, stageNumber };
});
