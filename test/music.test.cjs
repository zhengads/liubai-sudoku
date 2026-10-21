const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function setup(preference = null, blocked = false) {
  const events = {},
    documentEvents = {},
    attrs = {},
    timers = [],
    oscillators = [],
    contexts = [],
    filters = [];
  const values = new Map(preference ? [['liubai-music', preference]] : []);
  const storageCalls = [];
  const storage = {
    getItem: (key) => {
      storageCalls.push(['read', key]);
      return values.get(key) || null;
    },
    setItem: (key, value) => {
      storageCalls.push(['write', key]);
      values.set(key, value);
    },
  };
  const control = {
    setAttribute: (k, v) => {
      attrs[k] = v;
    },
    addEventListener: (k, fn) => {
      events[k] = fn;
    },
  };
  const label = { textContent: '' },
    status = { textContent: '' };
  const welcomeClasses = new Set();
  const welcome = {
    hidden: false,
    classList: {
      toggle(name, on) {
        if (on) welcomeClasses.add(name);
        else welcomeClasses.delete(name);
      },
    },
  };
  const parameter = () => ({
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
    setTargetAtTime() {},
  });
  const node = () => ({
    connect() {},
    disconnect() {},
    gain: parameter(),
    pan: parameter(),
    Q: parameter(),
    frequency: parameter(),
    threshold: parameter(),
    ratio: parameter(),
  });
  class Audio {
    constructor() {
      this.currentTime = 0;
      this.sampleRate = 1000;
      this.state = 'suspended';
      this.destination = node();
      this.resumes = 0;
      this.events = {};
      contexts.push(this);
    }
    addEventListener(type, listener) {
      this.events[type] = listener;
    }
    createGain() {
      return node();
    }
    createStereoPanner() {
      return node();
    }
    createBiquadFilter() {
      const filter = node();
      filters.push(filter);
      return filter;
    }
    createDynamicsCompressor() {
      return node();
    }
    createConvolver() {
      return node();
    }
    createBuffer(channels, length) {
      const samples = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: (i) => samples[i] };
    }
    createOscillator() {
      const o = {
        ...node(),
        start(t) {
          this.startedAt = t;
        },
        stop(t) {
          this.stoppedAt = t;
        },
      };
      oscillators.push(o);
      return o;
    }
    async resume() {
      if (blocked && !this.resumes++)
        return new Promise((resolve) => {
          this.release = resolve;
        });
      this.state = 'running';
    }
    async suspend() {
      this.state = 'suspended';
    }
    async close() {
      this.state = 'closed';
    }
  }
  const doc = {
    hidden: false,
    getElementById: (id) =>
      id === 'music-toggle'
        ? control
        : id === 'music-state'
          ? status
          : id === 'welcome'
            ? welcome
            : label,
    addEventListener: (k, fn) => {
      documentEvents[k] = fn;
    },
  };
  const sandbox = {
    URLSearchParams,
    window: { AudioContext: Audio, location: { search: '' }, localStorage: storage },
    document: doc,
    setInterval: (fn) => {
      sandbox.scheduler = fn;
      return 1;
    },
    clearInterval() {},
    setTimeout: (fn) => {
      timers.push(fn);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/music.js'), 'utf8'), sandbox);
  return {
    events,
    documentEvents,
    attrs,
    timers,
    oscillators,
    contexts,
    label,
    status,
    doc,
    sandbox,
    values,
    filters,
    storageCalls,
    welcomeClasses,
  };
}
test('Music defaults on, varies with the stage, pauses when hidden, and closes on stop', async () => {
  const h = setup();
  await new Promise(setImmediate);
  assert.equal(h.attrs['aria-checked'], 'true');
  assert.equal(h.status.textContent, '开启');
  assert.ok(h.oscillators.length > 10);
  assert.ok(
    h.oscillators.every(
      (o) => o.frequency.value > 40 && o.frequency.value < 4000 && o.stoppedAt > o.startedAt,
    ),
  );
  const oldCount = h.oscillators.length;
  h.sandbox.window.SudokuMusic.setStage(2);
  h.contexts[0].currentTime = 6;
  h.sandbox.scheduler();
  assert.ok(h.oscillators.length > oldCount);
  assert.notEqual(h.oscillators[oldCount].frequency.value, h.oscillators[0].frequency.value);
  assert.equal(h.contexts.length, 1);
  assert.equal(h.filters[0].frequency.value, 1000);
  assert.ok(h.filters[0].Q.value < 0.7);
  assert.ok(h.oscillators.every((o) => o.frequency.value < 1600));
  h.doc.hidden = true;
  h.documentEvents.visibilitychange();
  assert.equal(h.contexts[0].state, 'suspended');
  h.doc.hidden = false;
  h.documentEvents.visibilitychange();
  await new Promise(setImmediate);
  assert.equal(h.contexts[0].state, 'running');
  h.events.click();
  assert.equal(h.attrs['aria-checked'], 'false');
  assert.deepEqual(h.storageCalls, []);
  h.timers.forEach((fn) => fn());
  assert.equal(h.contexts[0].state, 'closed');
});
test('Every fresh launch defaults on, ignores old preferences and never reads or writes storage', async () => {
  const h = setup('off');
  await new Promise(setImmediate);
  assert.equal(h.attrs['aria-checked'], 'true');
  h.events.click();
  assert.equal(h.attrs['aria-checked'], 'false');
  const count = h.oscillators.length;
  h.documentEvents.pointerdown({ target: { closest: () => null } });
  assert.equal(h.oscillators.length, count);
  const reload = setup('off');
  await new Promise(setImmediate);
  assert.equal(reload.attrs['aria-checked'], 'true');
  assert.ok(reload.oscillators.length > 10);
  assert.deepEqual(h.storageCalls, []);
  assert.deepEqual(reload.storageCalls, []);
});
test('Returning from the menu starts music again while closing it during play stays effective', async () => {
  const h = setup();
  await new Promise(setImmediate);
  h.events.click();
  assert.equal(h.attrs['aria-checked'], 'false');
  await h.sandbox.window.SudokuMusic.enterGame(453);
  assert.equal(h.attrs['aria-checked'], 'true');
  h.events.click();
  h.sandbox.window.SudokuMusic.setScene('game', 454);
  assert.equal(h.attrs['aria-checked'], 'false');
  assert.deepEqual(h.storageCalls, []);
});
test('Menu and six stage arrangements stay in one audio context with no repeated render restart or high octave', async () => {
  const h = setup();
  await new Promise(setImmediate);
  const menuLength = h.oscillators.length;
  h.sandbox.window.SudokuMusic.setScene('game', 1);
  assert.ok(h.oscillators.length > menuLength);
  const entered = h.oscillators.length;
  h.sandbox.window.SudokuMusic.setScene('game', 1);
  assert.equal(h.oscillators.length, entered);
  const signatures = [];
  for (let stage = 2; stage <= 6; stage++) {
    const before = h.oscillators.length;
    h.sandbox.window.SudokuMusic.setScene('game', stage);
    signatures.push(
      h.oscillators
        .slice(before)
        .map((o) => o.frequency.value.toFixed(2))
        .join(','),
    );
  }
  assert.equal(new Set(signatures).size, 5);
  h.sandbox.window.SudokuMusic.setScene('menu', 6);
  assert.equal(h.contexts.length, 1);
  assert.ok(h.oscillators.every((o) => o.frequency.value < 1600));
});
test('A menu gesture unlocks blocked autoplay and disabling pending autoplay stays silent', async () => {
  const h = setup(null, true);
  assert.equal(h.oscillators.length, 0);
  h.documentEvents.pointerdown({ target: { closest: () => null } });
  await new Promise(setImmediate);
  assert.ok(h.oscillators.length > 10);
  const pending = setup(null, true);
  pending.events.click();
  pending.contexts[0].release();
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  assert.equal(pending.attrs['aria-checked'], 'false');
  assert.equal(pending.oscillators.length, 0);
});
test('Touch release and click can unlock playback without cycling the music switch', async () => {
  for (const type of ['pointerup', 'touchend', 'click']) {
    const h = setup(null, true);
    assert.ok(h.welcomeClasses.has('audio-waiting'));
    assert.equal(typeof h.documentEvents[type], 'function', `${type} must be handled`);
    h.documentEvents[type]({ target: { closest: () => null } });
    await new Promise(setImmediate);
    assert.equal(h.attrs['aria-checked'], 'true');
    assert.ok(h.oscillators.length > 10);
    assert.equal(h.contexts.length, 1);
    assert.ok(!h.welcomeClasses.has('audio-waiting'));
  }
});
test('A running state starts the score even if the initial resume promise is still pending', async () => {
  const h = setup(null, true);
  assert.equal(typeof h.contexts[0].events.statechange, 'function');
  h.contexts[0].state = 'running';
  h.contexts[0].events.statechange();
  assert.ok(h.oscillators.length > 10);
  const count = h.oscillators.length;
  h.contexts[0].events.statechange();
  assert.equal(h.oscillators.length, count);
});
