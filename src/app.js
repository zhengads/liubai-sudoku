(function () {
  'use strict';
  let S = window.Sudoku.create(9);
  const $ = (id) => document.getElementById(id);
  const names = { easy: '轻松', medium: '适中', hard: '挑战' };
  const STAGES = 120;
  const stageNumber = (size, level, stage) => window.SudokuProgress.stageNumber(size, level, stage);
  const stageLabel = (size, level, stage) =>
    String(stageNumber(size, level, stage)).padStart(3, '0');
  const qaMode = new URLSearchParams(window.location.search).get('qa') === '1';
  let storage;
  try {
    storage = qaMode ? window.SudokuProgress.memory() : window.localStorage;
  } catch {
    storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('Storage unavailable');
      },
    };
  }
  let completed = {};
  try {
    const saved = JSON.parse(storage.getItem('liubai-completed'));
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) completed = saved;
  } catch {}
  let state,
    selected = -1,
    noteMode = false,
    paused = false,
    history = [],
    toastTimeout;
  let home = true,
    hasStarted = false;
  let lastTick = performance.now(),
    saveAvailable = true;
  let zoom = 100;
  let keypadOpen = false;
  const cells = [];
  const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  function newState(level, size = 9, stage = 1) {
    const engine = window.Sudoku.create(size);
    const seed =
      (stage * 2654435761 +
        size * 10007 +
        ['easy', 'medium', 'hard'].indexOf(level) * 998244353) >>>
      0;
    const game = engine.generate(level, window.Sudoku.seeded(seed));
    return {
      ...game,
      stage,
      board: game.puzzle.slice(),
      notes: Array.from({ length: engine.length }, () => []),
      elapsed: 0,
      hints: 0,
      won: false,
    };
  }
  function validSaved(s) {
    if (!s || !window.Sudoku.configs[s.size || 9]) return false;
    const engine = window.Sudoku.create(s.size || 9);
    const grid = (a) =>
      Array.isArray(a) &&
      a.length === engine.length &&
      a.every((n) => Number.isInteger(n) && n >= 0 && n <= engine.size);
    return (
      names[s.level] &&
      grid(s.puzzle) &&
      grid(s.board) &&
      grid(s.solution) &&
      engine.complete(s.solution) &&
      s.puzzle.every((n, i) => !n || (n === s.solution[i] && n === s.board[i])) &&
      Array.isArray(s.notes) &&
      s.notes.length === engine.length &&
      s.notes.every(
        (a) =>
          Array.isArray(a) &&
          new Set(a).size === a.length &&
          a.every((n) => Number.isInteger(n) && n >= 1 && n <= engine.size),
      ) &&
      Number.isFinite(s.elapsed) &&
      s.elapsed >= 0 &&
      Number.isInteger(s.hints) &&
      s.hints >= 0 &&
      (s.stage === undefined || (Number.isInteger(s.stage) && s.stage >= 1 && s.stage <= STAGES))
    );
  }
  const progress = window.SudokuProgress.create(storage, validSaved);
  function restore() {
    const saved = progress.last();
    if (saved) saved.won = window.Sudoku.create(saved.size).complete(saved.board);
    return saved;
  }
  function save() {
    if (!hasStarted) return;
    saveAvailable = progress.save(state);
    $('save-state').hidden = saveAvailable;
    $('save-state').textContent = saveAvailable ? '' : '进度暂无法保存';
  }
  function toast(text) {
    clearTimeout(toastTimeout);
    $('toast').textContent = text;
    $('toast').hidden = false;
    toastTimeout = setTimeout(() => {
      $('toast').hidden = true;
    }, 2700);
  }
  function formatTime(seconds) {
    const n = Math.floor(seconds);
    return n >= 3600
      ? `${Math.floor(n / 3600)}:${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
      : `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  }
  function select(i, focus = false) {
    if (paused || i < 0 || i >= S.length) return;
    selected = i;
    render();
    if (focus) {
      cells[i].focus({ preventScroll: true });
      if ($('board-viewport').classList.contains('zoomed'))
        cells[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
  function render() {
    const conflict = S.conflicts(state.board),
      invalid = new Set(conflict.cells.filter((i) => !state.puzzle[i]));
    const related = selected >= 0 ? new Set(S.peers[selected]) : new Set();
    const selectedValue = selected >= 0 ? state.board[selected] : 0;
    for (let i = 0; i < S.length; i++) {
      const cell = cells[i],
        n = state.board[i];
      cell.className = 'cell';
      if (S.col(i) === S.size - 1) cell.classList.add('edge-right');
      else if ((S.col(i) + 1) % S.boxCols === 0) cell.classList.add('block-right');
      if (S.row(i) === S.size - 1) cell.classList.add('edge-bottom');
      else if ((S.row(i) + 1) % S.boxRows === 0) cell.classList.add('block-bottom');
      if (state.puzzle[i]) cell.classList.add('given');
      if (related.has(i)) cell.classList.add('related');
      if (selectedValue && n === selectedValue) cell.classList.add('same');
      if (selected === i) cell.classList.add('selected');
      if (invalid.has(i)) cell.classList.add('conflict');
      cell.setAttribute('aria-pressed', String(selected === i));
      cell.setAttribute('aria-invalid', String(invalid.has(i)));
      cell.tabIndex = (selected < 0 ? i === state.puzzle.findIndex((n) => !n) : selected === i)
        ? 0
        : -1;
      const notes = state.notes[i];
      if (!n && notes.length) cell.classList.add('notes');
      const contentKey = n ? `value:${n}` : `notes:${notes.join(',')}`;
      if (cell.dataset.content !== contentKey) {
        cell.innerHTML = n
          ? `<span class="cell-value">${n}</span>`
          : notes.length
            ? Array.from(
                { length: S.size },
                (_, k) =>
                  `<span class="candidate" aria-hidden="true">${notes.includes(k + 1) ? k + 1 : ''}</span>`,
              ).join('')
            : '';
        cell.dataset.content = contentKey;
      }
      cell.setAttribute(
        'aria-label',
        `第${S.row(i) + 1}行，第${S.col(i) + 1}列，${n ? n + (state.puzzle[i] ? '，题目数字' : '') : state.notes[i].length ? '草稿 ' + state.notes[i].join('、') : '空格'}${invalid.has(i) ? '，数字冲突' : ''}`,
      );
    }
    const total = state.puzzle.filter((n) => !n).length;
    const filled = state.board.filter((n, i) => n && !state.puzzle[i]).length;
    $('filled').textContent = filled;
    $('total').textContent = total;
    $('progress-fill').style.width = `${(filled / total) * 100}%`;
    document
      .querySelector('.progress-track')
      .setAttribute('aria-valuenow', Math.round((filled / total) * 100));
    $('notes-toggle').setAttribute('aria-pressed', String(noteMode));
    $('keypad').classList.toggle('notes-mode', noteMode);
    for (const key of document.querySelectorAll('.digit-key[data-digit]')) {
      const n = Number(key.dataset.digit),
        remaining = Math.max(0, S.size - state.board.filter((v) => v === n).length);
      key.classList.toggle('finished', remaining === 0);
      key.setAttribute('aria-label', `${noteMode ? '草稿' : '填入'} ${n}，剩余 ${remaining} 个`);
    }
    $('undo').disabled = history.length === 0 || paused || state.won;
    $('erase').disabled = paused || state.won;
    $('hint').disabled = paused || state.won;
    $('notes-toggle').disabled = paused || state.won;
    for (const key of $('keypad').children)
      key.disabled = paused || state.won || selected < 0 || !!state.puzzle[selected];
    $('keypad-toggle').disabled = paused || state.won;
    for (const level of document.querySelectorAll('.level')) {
      const active = level.dataset.level === state.level;
      level.classList.toggle('active', active);
      level.setAttribute('aria-pressed', String(active));
    }
    for (const size of document.querySelectorAll('[data-size]'))
      size.setAttribute('aria-pressed', String(Number(size.dataset.size) === S.size));
    $('stage-label').textContent = `第 ${stageLabel(S.size, state.level, state.stage)} 关`;
    window.SudokuMusic.setScene(
      home ? 'menu' : 'game',
      stageNumber(S.size, state.level, state.stage),
    );
    $('selected-location').textContent =
      selected < 0
        ? zoom > 100
          ? '滑动查看棋盘'
          : '棋盘视图'
        : `第 ${S.row(selected) + 1} 行 · 第 ${S.col(selected) + 1} 列`;
    $('timer').textContent = formatTime(state.elapsed);
    $('pause').disabled = state.won;
    $('pause').setAttribute('aria-label', paused ? '继续游戏' : '暂停游戏');
    $('pause').title = paused ? '继续游戏' : '暂停游戏';
    $('pause').innerHTML = icon(paused ? 'play' : 'pause');
    $('pause-cover').hidden = !paused;
    $('board-viewport').classList.toggle('is-paused', paused);
    $('board').inert = paused;
    $('board').style.visibility = paused ? 'hidden' : '';
  }
  function snapshot() {
    return { board: state.board.slice(), notes: state.notes.map((a) => a.slice()) };
  }
  function edit(action) {
    if (paused || state.won) return;
    if (selected < 0) return toast('先轻点棋盘上的一个空格');
    if (state.puzzle[selected]) return toast('这是题目数字，请选择一个空格');
    const before = snapshot();
    if (!action()) return;
    history.push(before);
    if (history.length > 150) history.shift();
    state.won = S.complete(state.board);
    save();
    render();
    const changeClass =
      state.board[selected] && before.board[selected] !== state.board[selected]
        ? 'just-entered'
        : state.notes[selected].length
          ? 'just-noted'
          : 'just-erased';
    const changedCell = cells[selected];
    changedCell.classList.add(changeClass);
    setTimeout(() => changedCell.classList.remove(changeClass), 550);
    if (changeClass === 'just-entered') {
      $('filled').classList.remove('progress-bump');
      void $('filled').offsetWidth;
      $('filled').classList.add('progress-bump');
    }
    if (state.won) showWin();
  }
  function input(n) {
    if (noteMode && selected >= 0 && state.board[selected] && !state.puzzle[selected])
      return toast('先擦除已填数字，再添加草稿');
    edit(() => S.enter(state, selected, n, noteMode));
  }
  function erase() {
    edit(() => S.erase(state, selected));
  }
  function undo() {
    if (paused || state.won || !history.length) return;
    Object.assign(state, history.pop());
    save();
    render();
  }
  function toggleNotes() {
    if (paused || state.won) return;
    noteMode = !noteMode;
    render();
  }
  function setPaused(value) {
    if (state.won) return;
    paused = value;
    if (value) setKeypadOpen(false);
    lastTick = performance.now();
    save();
    render();
  }
  function openDialog(title, body, actions, symbol = '✳') {
    setKeypadOpen(false);
    setZoomPopover(false);
    $('modal').classList.remove('catalog', 'win', 'hint-dialog');
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = body;
    $('modal-symbol').textContent = symbol;
    $('modal-actions').replaceChildren();
    for (const action of actions) {
      const button = document.createElement('button');
      button.textContent = action.text;
      button.className = action.primary ? 'primary-button' : 'secondary-button';
      button.addEventListener('click', () => {
        $('modal').close();
        if (action.run) action.run();
      });
      $('modal-actions').append(button);
    }
    lastTick = performance.now();
    if (!$('modal').open) $('modal').showModal();
  }
  function start(level, size = S.size, stage = 1) {
    save();
    const archived = progress.stage(size, level, stage);
    S = window.Sudoku.create(size);
    state = archived || newState(level, size, stage);
    state.won = S.complete(state.board);
    history = [];
    selected = -1;
    noteMode = false;
    paused = false;
    buildBoard();
    lastTick = performance.now();
    enterGame();
  }
  function requestNew(level, size = S.size, stage = 1) {
    if (level === state.level && size === S.size && stage === state.stage) {
      if (home) enterGame();
      return;
    }
    start(level, size, stage);
  }
  function nextStage() {
    requestNew(state.level, S.size, (state.stage % STAGES) + 1);
  }
  let changingView = false;
  function enterGame() {
    const fromHome = home;
    // Resume audio during the actual click, before the asynchronous view transition.
    if (fromHome) window.SudokuMusic.enterGame(stageNumber(S.size, state.level, state.stage));
    const reveal = () => {
      home = false;
      hasStarted = true;
      lastTick = performance.now();
      document.body.classList.remove('at-home');
      $('home-screen').hidden = true;
      $('game-screen').hidden = false;
      $('keypad-toggle').hidden = false;
      paused = false;
      render();
      save();
      window.scrollTo({ top: 0, behavior: 'instant' });
      $('stage-label').setAttribute('tabindex', '-1');
      $('stage-label').focus({ preventScroll: true });
    };
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (fromHome && document.startViewTransition && !reducedMotion && !changingView) {
      changingView = true;
      const transition = document.startViewTransition(reveal);
      transition.ready.catch(() => {});
      transition.finished
        .catch(() => {})
        .finally(() => {
          changingView = false;
        });
    } else {
      reveal();
      if (fromHome && !reducedMotion)
        $('game-screen').animate(
          [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: 260, easing: 'ease-out' },
        );
    }
  }
  function showHome() {
    home = true;
    setKeypadOpen(false);
    setZoomPopover(false);
    save();
    document.body.classList.add('at-home');
    window.SudokuMusic.setScene('menu', stageNumber(S.size, state.level, state.stage));
    $('home-screen').hidden = false;
    $('game-screen').hidden = true;
    $('keypad-toggle').hidden = true;
    $('home-continue').innerHTML = `${hasStarted ? '继续上关' : '开始游戏'}${icon('arrow')}`;
    $('home-restart').hidden = !hasStarted;
    $('home-save').textContent = hasStarted
      ? `第 ${stageLabel(S.size, state.level, state.stage)} 关 · ${S.size}×${S.size} · ${names[state.level]}${state.won ? ' · 已完成' : ''}`
      : '';
    lastTick = performance.now();
  }
  function restartCurrent() {
    const restart = () => {
      state = newState(state.level, S.size, state.stage);
      history = [];
      selected = -1;
      noteMode = false;
      paused = false;
      buildBoard();
      enterGame();
    };
    const hasInput =
      state.board.some((n, i) => n && !state.puzzle[i]) || state.notes.some((a) => a.length);
    if (hasInput || state.elapsed > 0)
      openDialog(
        `重新开始第 ${stageLabel(S.size, state.level, state.stage)} 关？`,
        '<p>本关的填写、草稿和计时将重置。</p>',
        [{ text: '取消' }, { text: '重新开始', primary: true, run: restart }],
        '',
      );
    else restart();
  }
  $('home-continue').addEventListener('click', enterGame);
  $('home-restart').addEventListener('click', restartCurrent);
  $('home-catalog').addEventListener('click', () => showStages());
  document.querySelector('.brand').addEventListener('click', (e) => {
    e.preventDefault();
    showHome();
    $('home-continue').focus({ preventScroll: true });
  });
  function showStages(
    page = Math.floor((state.stage - 1) / 24),
    size = S.size,
    level = state.level,
  ) {
    save();
    const startAt = page * 24 + 1;
    const key = (n) => `${size}-${level}-${n}`;
    const count = Array.from({ length: STAGES }, (_, i) => i + 1).filter(
      (n) => completed[key(n)],
    ).length;
    const filled = state.board.filter((n, i) => n && !state.puzzle[i]).length;
    const total = state.puzzle.filter((n) => !n).length;
    const grid = Array.from({ length: 24 }, (_, i) => startAt + i)
      .map((n) => {
        const current = hasStarted && size === S.size && level === state.level && n === state.stage;
        const saved = progress.stage(size, level, n);
        const status = current
          ? '上次游玩'
          : completed[key(n)]
            ? '已完成 ✓'
            : saved
              ? '可读档'
              : '';
        const number = stageLabel(size, level, n);
        return `<button class="stage-tile${current ? ' current' : ''}${completed[key(n)] ? ' solved' : ''}${saved ? ' has-save' : ''}" data-stage="${n}" aria-label="第 ${number} 关，${size}×${size}，${names[level]}${status ? `，${status}` : ''}"${current ? ' aria-current="true"' : ''}><strong>${number}</strong><span>${status}</span></button>`;
      })
      .join('');
    const sizeTabs = [6, 9, 16]
      .map(
        (n) => `<button data-catalog-size="${n}" aria-pressed="${n === size}">${n}×${n}</button>`,
      )
      .join('');
    const levelTabs = Object.entries(names)
      .map(
        ([k, name]) =>
          `<button data-catalog-level="${k}" aria-pressed="${k === level}">${name}</button>`,
      )
      .join('');
    const pages = Array.from({ length: 5 }, (_, p) => {
      const first = stageNumber(size, level, p * 24 + 1),
        last = stageNumber(size, level, (p + 1) * 24);
      return `<button data-catalog-page="${p}" aria-pressed="${p === page}" aria-label="第 ${first} 至 ${last} 关">${first}–${last}</button>`;
    }).join('');
    openDialog(
      '关卡目录',
      `${hasStarted ? `<div class="last-played"><div><span class="last-played-label">上次游玩</span><strong>${S.size}×${S.size} · ${names[state.level]} · 第 ${stageLabel(S.size, state.level, state.stage)} 关</strong><small>${state.won ? '已完成' : `已填 ${filled} / ${total}`} · 用时 ${formatTime(state.elapsed)}</small></div><button id="continue-save" class="primary-button">继续游戏${icon('arrow')}</button></div>` : ''}<div class="catalog-filters"><div aria-label="目录棋盘大小">${sizeTabs}</div><div aria-label="目录难度">${levelTabs}</div></div><div class="catalog-summary"><span>${size}×${size} · ${names[level]}</span><span>已完成 ${count} / ${STAGES}</span></div><div class="catalog-pages" aria-label="关卡范围">${pages}</div><div class="stage-grid">${grid}</div>`,
      [],
      '▦',
    );
    $('modal').classList.add('catalog');
    $('continue-save')?.addEventListener('click', () => {
      $('modal').close();
      enterGame();
    });
    for (const tile of document.querySelectorAll('[data-stage]'))
      tile.addEventListener('click', () => {
        const n = Number(tile.dataset.stage);
        $('modal').close();
        requestNew(level, size, n);
      });
    for (const tab of document.querySelectorAll('[data-catalog-size]'))
      tab.addEventListener('click', () => showStages(0, Number(tab.dataset.catalogSize), level));
    for (const tab of document.querySelectorAll('[data-catalog-level]'))
      tab.addEventListener('click', () => showStages(0, size, tab.dataset.catalogLevel));
    for (const tab of document.querySelectorAll('[data-catalog-page]'))
      tab.addEventListener('click', () => showStages(Number(tab.dataset.catalogPage), size, level));
  }
  function showWin() {
    completed[`${S.size}-${state.level}-${state.stage}`] = true;
    try {
      storage.setItem('liubai-completed', JSON.stringify(completed));
    } catch {}
    openDialog(
      `第 ${stageLabel(S.size, state.level, state.stage)} 关完成`,
      `<div class="win-stats"><div><strong>${formatTime(state.elapsed)}</strong>用时</div><div><strong>${state.hints}</strong>提示</div></div>`,
      [{ text: '查看棋盘' }, { text: '下一关', primary: true, run: nextStage }],
      '',
    );
    $('modal').classList.add('win');
    $('modal-symbol').innerHTML = icon('check');
    const particles = document.createElement('div');
    particles.className = 'win-particles';
    particles.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 18; i++) {
      const piece = document.createElement('i');
      const angle = (i / 18) * Math.PI * 2;
      piece.style.cssText = `--dx:${Math.cos(angle) * (95 + (i % 3) * 16)}px;--dy:${Math.sin(angle) * 65 + 25}px;--turn:${i * 47}deg;--delay:${(i % 4) * 35}ms`;
      particles.append(piece);
    }
    $('modal-body').prepend(particles);
  }
  function buildBoard() {
    setKeypadOpen(false);
    setZoomPopover(false);
    cells.length = 0;
    $('board').replaceChildren();
    $('keypad').replaceChildren();
    document.body.dataset.boardSize = S.size;
    document.querySelector('main').classList.toggle('large-board', S.size === 16);
    $('board').style.setProperty('--size', S.size);
    $('board').style.setProperty('--note-cols', S.boxCols);
    $('board').style.setProperty('--note-rows', S.boxRows);
    $('board-view-tools').hidden = false;
    setZoom(100);
    $('board-viewport').scrollLeft = 0;
    $('board-viewport').scrollTop = 0;
    for (let i = 0; i < S.length; i++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.index = i;
      button.addEventListener('click', () => {
        select(i);
        setKeypadOpen(!state.puzzle[i]);
      });
      cells.push(button);
      $('board').append(button);
    }
    for (let n = 1; n <= S.size; n++) {
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'digit-key';
      key.dataset.digit = n;
      key.textContent = n;
      key.addEventListener('click', () => input(n));
      $('keypad').append(key);
    }
  }
  function setKeypadOpen(open, focus = false) {
    open = !!open && !home && !paused && !(state && state.won);
    keypadOpen = open;
    $('input-dock').hidden = !open;
    $('keypad-toggle').setAttribute('aria-expanded', String(open));
    $('keypad-toggle-label').textContent = open ? '收起键盘' : '数字键盘';
    document.body.classList.toggle('keypad-open', open);
    if (open) {
      setZoomPopover(false);
      document.body.style.setProperty(
        '--dock-space',
        `${$('input-dock').getBoundingClientRect().height + 100}px`,
      );
      if (focus) $('keypad-close').focus({ preventScroll: true });
      if (selected >= 0)
        requestAnimationFrame(() => {
          if (!keypadOpen) return;
          const cell = cells[selected],
            panelRect = $('input-dock').getBoundingClientRect(),
            cellRect = cell.getBoundingClientRect();
          if (cellRect.right <= panelRect.left - 8 || cellRect.left >= panelRect.right + 8) return;
          const panelTop = panelRect.top;
          let covered = cell.getBoundingClientRect().bottom - panelTop + 16;
          if (covered > 0 && zoom > 100) $('board-viewport').scrollTop += covered;
          covered = cell.getBoundingClientRect().bottom - panelTop + 16;
          if (covered > 0) window.scrollBy({ top: covered, behavior: 'instant' });
        });
    }
  }
  $('keypad-toggle').addEventListener('click', () => setKeypadOpen(!keypadOpen, true));
  $('keypad-close').addEventListener('click', () => {
    setKeypadOpen(false);
    $('keypad-toggle').focus({ preventScroll: true });
  });
  document.addEventListener('pointerdown', (event) => {
    if (keypadOpen && !event.target.closest('#input-dock, #keypad-toggle, #board'))
      setKeypadOpen(false);
    if (!event.target.closest('.zoom-controls')) setZoomPopover(false);
  });
  let resizeFrame;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (keypadOpen) setKeypadOpen(true);
    });
  });
  $('notes-toggle').addEventListener('click', toggleNotes);
  $('erase').addEventListener('click', erase);
  $('undo').addEventListener('click', undo);
  $('pause').addEventListener('click', () => setPaused(!paused));
  $('resume').addEventListener('click', () => setPaused(false));
  $('new-game').addEventListener('click', nextStage);
  $('stage-select').addEventListener('click', () => showStages());
  for (const button of document.querySelectorAll('[data-size]'))
    button.addEventListener('click', () => {
      const size = Number(button.dataset.size);
      if (size !== S.size) requestNew(state.level, size);
    });
  function setZoom(value) {
    const viewport = $('board-viewport');
    const previous = zoom;
    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / previous;
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / previous;
    zoom = Math.max(100, Math.min(300, Number(value) || 100));
    viewport.style.setProperty('--board-zoom', zoom / 100);
    viewport.classList.toggle('zoomed', zoom > 100);
    $('zoom-range').value = zoom;
    $('zoom-range').setAttribute('aria-valuetext', `${zoom}%`);
    $('zoom-value').value = `${zoom}%`;
    $('zoom-out').disabled = zoom <= 100;
    $('zoom-in').disabled = zoom >= 300;
    if (state && selected < 0)
      $('selected-location').textContent = zoom > 100 ? '滑动查看棋盘' : '棋盘视图';
    viewport.scrollLeft = centerX * zoom - viewport.clientWidth / 2;
    viewport.scrollTop = centerY * zoom - viewport.clientHeight / 2;
  }
  $('zoom-range').addEventListener('input', (e) => setZoom(e.target.value));
  function setZoomPopover(open) {
    $('zoom-popover').hidden = !open;
    $('zoom-percent').setAttribute('aria-expanded', String(!!open));
  }
  $('zoom-percent').addEventListener('click', () => setZoomPopover($('zoom-popover').hidden));
  $('zoom-in').addEventListener('click', () => setZoom(zoom + 25));
  $('zoom-out').addEventListener('click', () => setZoom(zoom - 25));
  $('zoom-reset').addEventListener('click', () => {
    setZoom(100);
    setZoomPopover(false);
  });
  for (const button of document.querySelectorAll('.level'))
    button.addEventListener('click', () => {
      if (button.dataset.level !== state.level) requestNew(button.dataset.level);
    });
  $('hint').addEventListener('click', () => {
    if (paused || state.won) return;
    const step = S.hint(state.board, state.puzzle, selected);
    if (!step) return;
    state.hints++;
    save();
    select(step.index);
    const position = (i) => `第 ${S.row(i) + 1} 行第 ${S.col(i) + 1} 列`;
    const list = (values) => (values.length ? values.join('、') : '无');
    const returnToCell = () => {
      noteMode = false;
      select(step.index, true);
      setKeypadOpen(true);
    };
    let title = '从这一格开始',
      body = '',
      actions = [{ text: '关闭' }, { text: '我来填', primary: true, run: returnToCell }];
    if (step.kind === 'conflict') {
      title = '先检查这一格';
      body = `<p class="hint-position">${position(step.index)}</p><p>这里填了 <strong>${step.value}</strong>，但第 ${step.unit.number} ${step.unit.type}里已经有相同数字。</p><p>先修改这一格，再继续推理。</p>`;
      actions = [{ text: '关闭' }, { text: '去修改', primary: true, run: returnToCell }];
    } else {
      const candidateChips = Array.from({ length: S.size }, (_, i) => i + 1)
        .map(
          (n) =>
            `<span class="hint-number${step.candidates.includes(n) ? ' possible' : ''}">${n}</span>`,
        )
        .join('');
      const elimination = `<div class="hint-evidence"><p><span>同行已有</span><strong>${list(step.rowValues)}</strong></p><p><span>同列已有</span><strong>${list(step.columnValues)}</strong></p><p><span>同宫已有</span><strong>${list(step.boxValues)}</strong></p></div>`;
      body = `<p class="hint-position">${position(step.index)}</p>${elimination}<p>从 1–${S.size} 中排除这些数字：</p><div class="hint-numbers">${candidateChips}</div>`;
      if (step.kind === 'single') {
        title = '排除后，只剩一个数';
        body += `<p class="hint-conclusion">只剩下 <strong>${step.value}</strong>，所以这一格只能填 <strong>${step.value}</strong>。</p>`;
      } else if (step.kind === 'hidden') {
        title = '这个数，只有一个位置';
        const reasons = step.exclusions
          .map(
            (ex) =>
              `<li>${position(ex.index)}：同${ex.relation}已有 ${step.value}，不能填 ${step.value}。</li>`,
          )
          .join('');
        body += `<p class="hint-conclusion">第 ${step.unit.number} ${step.unit.type}还缺 <strong>${step.value}</strong>。其它空格都不能放它，因此只能放在<strong>${position(step.index)}</strong>。</p>${reasons ? `<details class="hint-reasons"><summary>查看其它位置为什么被排除</summary><ul>${reasons}</ul></details>` : ''}`;
      } else if (step.kind === 'blocked') {
        title = '这里已经无数可填';
        body +=
          '<p class="hint-conclusion">所有数字都被排除了。可能前面的某次填写需要调整，请回看这一格所在的行、列和宫。</p>';
        actions = [{ text: '关闭' }, { text: '回棋盘检查', primary: true, run: returnToCell }];
      } else {
        title = '先缩小可能的范围';
        body += `<p class="hint-conclusion">这里还可能是 <strong>${list(step.candidates)}</strong>，目前不能确定唯一数字。先记成草稿，再观察这些数字在同行、同列或同宫能放在哪些位置。</p>`;
        actions = [
          { text: '关闭' },
          {
            text: '记入草稿',
            primary: true,
            run: () => {
              select(step.index);
              edit(() => {
                if (JSON.stringify(state.notes[step.index]) === JSON.stringify(step.candidates))
                  return false;
                state.notes[step.index] = step.candidates.slice();
                return true;
              });
              noteMode = true;
              render();
              setKeypadOpen(true);
            },
          },
        ];
      }
    }
    openDialog(title, body, actions, '');
    $('modal').classList.add('hint-dialog');
  });
  $('help-button').addEventListener('click', () =>
    openDialog(
      '玩法指南',
      `<p>当前棋盘使用 1–${S.size}，让<strong>每一行、每一列、每个 ${S.boxRows}×${S.boxCols} 宫</strong>的数字都不重复。</p><ol class="guide-list"><li>轻点空格展开数字键盘；点击“收起键盘”、关闭按钮、棋盘外部或按 Esc 收起，也可通过右下角按钮再次打开。手机不会弹出系统键盘。</li><li>开启<strong>铅笔草稿</strong>记下可能性；再点同一数字可取消，擦除可清空整格。</li><li>重复的格子会显示浅红底色，纠正后自动恢复。</li><li>电脑用数字键填写，16×16 中 A–G 对应 10–16；方向键移动，N 切换草稿，删除键擦除，Ctrl / ⌘ + Z 撤销。</li><li>三种棋盘、三种难度各 120 关。在关卡目录中直接选关、继续上次或恢复各关存档；难度按留空数量区分。棋盘可用滑杆或加减按钮在 100%–300% 之间调节，点全览复位，放大后上下左右滑动查看。</li><li>右上角轻音乐可播放、暂停，切出页面会暂停音乐。</li></ol><p>进度保存在当前浏览器中。</p>`,
      [{ text: '关闭', primary: true }],
    ),
  );
  $('modal-close').addEventListener('click', () => $('modal').close());
  $('modal').addEventListener('click', (e) => {
    if (e.target === $('modal')) {
      const r = $('modal').getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        $('modal').close();
    }
  });
  $('modal').addEventListener('close', () => {
    lastTick = performance.now();
  });
  document.addEventListener('keydown', (e) => {
    if (home) return;
    if ($('modal').open) return;
    if (e.key === 'Escape' && !$('zoom-popover').hidden) {
      e.preventDefault();
      setZoomPopover(false);
      $('zoom-percent').focus({ preventScroll: true });
      return;
    }
    if (e.target.closest('input, textarea, select, [contenteditable=true]')) return;
    if (e.key === 'Escape' && keypadOpen) {
      e.preventDefault();
      setKeypadOpen(false);
      $('keypad-toggle').focus({ preventScroll: true });
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.toLowerCase() === 'n') {
      e.preventDefault();
      toggleNotes();
      return;
    }
    if (paused || state.won) return;
    if (/^[1-9]$/.test(e.key) && Number(e.key) <= S.size) {
      e.preventDefault();
      input(Number(e.key));
    }
    if (S.size === 16 && /^[a-g]$/i.test(e.key)) {
      e.preventDefault();
      input(e.key.toLowerCase().charCodeAt(0) - 87);
    }
    if (['Backspace', 'Delete', '0'].includes(e.key)) {
      e.preventDefault();
      erase();
    }
    const moves = { ArrowUp: -S.size, ArrowDown: S.size, ArrowLeft: -1, ArrowRight: 1 };
    if (e.key in moves) {
      e.preventDefault();
      const current = selected < 0 ? 0 : selected;
      if (selected < 0)
        return select(
          state.puzzle.findIndex((n) => !n),
          true,
        );
      if (
        (e.key === 'ArrowLeft' && S.col(current) === 0) ||
        (e.key === 'ArrowRight' && S.col(current) === S.size - 1)
      )
        return;
      select(current + moves[e.key], true);
    }
  });
  function tick() {
    const now = performance.now(),
      delta = Math.max(0, (now - lastTick) / 1000);
    lastTick = now;
    if (!home && !paused && !state.won && !document.hidden && !$('modal').open) {
      state.elapsed += delta;
      $('timer').textContent = formatTime(state.elapsed);
    }
  }
  document.addEventListener('visibilitychange', () => {
    lastTick = performance.now();
    if (document.hidden) save();
  });
  window.addEventListener('pagehide', save);
  setInterval(tick, 500);
  setInterval(save, 5000);
  const restored = restore();
  state = restored || newState('easy');
  hasStarted = !!restored;
  S = window.Sudoku.create(state.size);
  buildBoard();
  render();
  showHome();
  $('welcome').addEventListener('animationend', (event) => {
    if (event.target === $('welcome')) $('welcome').hidden = true;
  });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) $('welcome').hidden = true;
})();
