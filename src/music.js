(function () {
  'use strict';
  // Original instrumental score, synthesized locally with Web Audio.
  // No audio downloads, external services, microphone, or paid APIs.
  const button = document.getElementById('music-toggle');
  const label = document.getElementById('music-label');
  const status = document.getElementById('music-state');
  const chords = [
    [48, 60, 64, 67],
    [43, 59, 62, 67],
    [45, 57, 60, 64],
    [40, 55, 59, 64],
    [41, 57, 60, 65],
    [48, 55, 60, 64],
    [38, 57, 62, 65],
    [43, 55, 59, 62],
    [48, 60, 64, 67],
    [43, 59, 62, 67],
    [45, 57, 60, 64],
    [40, 55, 59, 64],
    [41, 57, 60, 65],
    [48, 55, 60, 64],
    [43, 55, 59, 62],
    [48, 55, 60, 64],
  ];
  const melody = [
    [
      [0, 76],
      [1.5, 79],
      [3, 74],
    ],
    [
      [0.5, 74],
      [2, 71],
      [3.5, 67],
    ],
    [
      [0, 72],
      [1.5, 76],
      [3, 79],
    ],
    [
      [0.5, 76],
      [2.5, 71],
    ],
    [
      [0, 69],
      [1, 72],
      [2.5, 77],
    ],
    [
      [0.5, 76],
      [2, 72],
      [3.5, 67],
    ],
    [
      [0, 74],
      [1.5, 77],
      [3, 76],
    ],
    [
      [0.5, 74],
      [2.5, 71],
    ],
    [
      [0, 79],
      [1.5, 76],
      [3, 72],
    ],
    [
      [0.5, 74],
      [2, 71],
      [3.5, 74],
    ],
    [
      [0, 76],
      [1.5, 72],
      [3, 69],
    ],
    [
      [0.5, 71],
      [2.5, 67],
    ],
    [
      [0, 69],
      [1.5, 72],
      [3, 77],
    ],
    [
      [0, 76],
      [2, 72],
    ],
    [
      [0, 74],
      [1.5, 71],
      [3, 67],
    ],
    [
      [0, 72],
      [2.5, 76],
    ],
  ];
  const scores = [
    { chords, melody, shift: -12 },
    {
      chords: [
        [45, 57, 60, 64],
        [41, 57, 60, 65],
        [48, 55, 60, 64],
        [43, 55, 59, 62],
        [38, 57, 62, 65],
        [45, 57, 60, 64],
        [41, 53, 57, 60],
        [40, 55, 59, 64],
      ],
      melody: [
        [
          [0, 69],
          [2.5, 72],
        ],
        [
          [0.5, 72],
          [2, 69],
        ],
        [
          [0, 67],
          [1.5, 72],
          [3, 76],
        ],
        [
          [1, 71],
          [3, 67],
        ],
        [
          [0, 69],
          [2.5, 74],
        ],
        [
          [0.5, 72],
          [2.5, 69],
        ],
        [
          [1, 65],
          [3, 69],
        ],
        [
          [0, 67],
          [2.5, 71],
        ],
      ],
      shift: -12,
    },
    {
      chords: [
        [43, 55, 59, 62],
        [40, 55, 59, 64],
        [48, 55, 60, 64],
        [38, 54, 57, 62],
        [45, 57, 60, 64],
        [48, 55, 60, 64],
        [38, 54, 57, 62],
        [43, 55, 59, 62],
      ],
      melody: [
        [
          [0.5, 71],
          [2.5, 74],
        ],
        [
          [0, 76],
          [2, 71],
        ],
        [
          [1, 72],
          [3, 67],
        ],
        [
          [0, 69],
          [2, 74],
        ],
        [
          [0.5, 72],
          [2.5, 69],
        ],
        [
          [0, 67],
          [3, 72],
        ],
        [
          [1, 74],
          [3, 69],
        ],
        [
          [0, 71],
          [2.5, 67],
        ],
      ],
      shift: -12,
    },
  ];
  const menuScore = {
    chords: [
      [48, 55, 60, 64],
      [45, 52, 57, 60],
      [41, 53, 57, 60],
      [43, 55, 59, 62],
    ],
    melody: [
      [
        [0.5, 64],
        [3, 67],
      ],
      [
        [1, 60],
        [3, 64],
      ],
      [
        [0.5, 65],
        [2.5, 60],
      ],
      [
        [1, 62],
        [3, 59],
      ],
    ],
    shift: 0,
  };
  const themes = [
    { score: 0, transpose: 0, beat: 1.65, reverse: false, wet: 0.15 },
    { score: 1, transpose: -2, beat: 1.8, reverse: true, wet: 0.19 },
    { score: 2, transpose: -5, beat: 1.6, reverse: false, wet: 0.14 },
    { score: 0, transpose: -2, beat: 1.72, reverse: true, wet: 0.18 },
    { score: 1, transpose: 0, beat: 1.9, reverse: false, wet: 0.2 },
    { score: 2, transpose: -3, beat: 1.7, reverse: true, wet: 0.16 },
  ];
  let enabled = true;
  let context = null,
    master = null,
    mix = null,
    room = null,
    wet = null,
    nextBar = 0,
    bar = 0,
    interval = null,
    stage = 1,
    scene = 'menu';
  function makeMix(volume) {
    const node = context.createGain();
    node.gain.value = volume;
    node.connect(master);
    node.connect(room);
    return node;
  }
  function setScene(value, number = stage) {
    number = Math.max(1, Number(number) || 1);
    const changed = scene !== value || (value === 'game' && stage !== number);
    scene = value;
    stage = number;
    if (
      !changed ||
      !enabled ||
      !context ||
      context.state !== 'running' ||
      !mix ||
      interval === null
    )
      return;
    const fading = mix,
      at = context.currentTime;
    fading.gain.cancelScheduledValues(at);
    fading.gain.setTargetAtTime(0.0001, at, 0.45);
    mix = makeMix(0.0001);
    mix.gain.setTargetAtTime(1, at, 0.65);
    // Keep the musical phrase moving instead of replaying its opening.
    nextBar = at + 0.1;
    schedule();
    setTimeout(() => fading.disconnect(), 12000);
  }
  window.SudokuMusic = {
    setScene,
    setStage(number) {
      setScene('game', number);
    },
    enterGame(number) {
      enabled = true;
      reflect();
      setScene('game', number);
      return ensurePlaying();
    },
  };
  function frequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  function voice(midi, at, duration, volume, pad = false, pan = 0) {
    const envelope = context.createGain(),
      stereo = context.createStereoPanner();
    stereo.pan.value = pan;
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(volume, at + (pad ? 1.2 : 0.14));
    envelope.gain.exponentialRampToValueAtTime(volume * (pad ? 0.5 : 0.16), at + duration * 0.6);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    envelope.connect(stereo);
    stereo.connect(mix);
    const oscillators = (
      pad
        ? [
            [1, 1],
            [2, 0.025],
          ]
        : [
            [1, 1],
            [2, 0.055],
            [3, 0.008],
          ]
    ).map(([harmonic, gain]) => {
      const oscillator = context.createOscillator(),
        harmonicGain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency(midi) * harmonic;
      harmonicGain.gain.value = gain;
      oscillator.connect(harmonicGain);
      harmonicGain.connect(envelope);
      oscillator.start(at);
      oscillator.stop(at + duration + 0.05);
      return [oscillator, harmonicGain];
    });
    oscillators[0][0].onended = () => {
      oscillators.forEach(([o, gain]) => {
        o.disconnect();
        gain.disconnect();
      });
      envelope.disconnect();
      stereo.disconnect();
    };
  }
  function schedule() {
    if (!enabled || !context || context.state !== 'running') return;
    if (nextBar < context.currentTime) nextBar = context.currentTime + 0.1;
    while (nextBar < context.currentTime + 2) {
      const isMenu = scene === 'menu';
      const theme = isMenu
        ? { transpose: 0, beat: 2.1, reverse: false, wet: 0.16 }
        : themes[(stage - 1) % themes.length];
      const score = isMenu ? menuScore : scores[theme.score],
        beat = theme.beat,
        barDuration = beat * 4;
      // Move through four phrases on longer sessions without replaying one short loop.
      const phrase = (Math.floor((stage - 1) / 6) + Math.floor(bar / 16)) % 4;
      const index = (bar + (isMenu ? 0 : phrase * 2)) % score.chords.length;
      const chord = score.chords[index].map((n) => n + theme.transpose);
      wet.gain.setTargetAtTime(theme.wet, nextBar, 1);
      voice(chord[0], nextBar, barDuration + 1.5, 0.12, true, -0.2);
      chord.slice(1).forEach((midi, i) => {
        voice(midi, nextBar + 0.1 + i * 0.04, barDuration + 1, 0.05, true, (i - 1) * 0.25);
        if (!isMenu)
          voice(
            midi,
            nextBar + ((theme.reverse ? 2 - i : i) + 0.5) * beat,
            4.2,
            0.04,
            false,
            (i - 1) * 0.28,
          );
      });
      const line = score.melody[index % score.melody.length],
        pitches = line.map((n) => n[1]);
      if (theme.reverse !== !!(phrase % 2)) pitches.reverse();
      line.forEach(([position], i) =>
        voice(
          pitches[i] + score.shift + theme.transpose,
          nextBar + position * beat,
          4.8,
          0.13,
          false,
          0.1,
        ),
      );
      nextBar += barDuration;
      bar++;
    }
  }
  function reflect() {
    const playing = enabled && context && context.state === 'running' && interval !== null;
    const welcome = document.getElementById('welcome');
    if (welcome && !welcome.hidden) welcome.classList.toggle('audio-waiting', enabled && !playing);
    button.setAttribute('aria-checked', String(enabled));
    button.setAttribute('data-playback', enabled ? (playing ? 'playing' : 'waiting') : 'off');
    button.title = enabled ? (playing ? '关闭轻音乐' : '已开启，轻触页面开始播放') : '开启轻音乐';
    label.textContent = '轻音乐';
    status.textContent = enabled ? '开启' : '关闭';
  }
  function startScore(opening) {
    if (!enabled || context !== opening || opening.state !== 'running' || document.hidden) {
      reflect();
      return;
    }
    if (interval === null) {
      bar = 0;
      nextBar = opening.currentTime + 0.12;
      master.gain.setTargetAtTime(0.2, opening.currentTime, 1);
      schedule();
      interval = setInterval(schedule, 600);
    }
    reflect();
  }
  async function ensurePlaying() {
    if (!enabled) return;
    try {
      if (!context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) throw new Error('Unsupported audio');
        context = new Audio();
        master = context.createGain();
        master.gain.value = 0.0001;
        const soften = context.createBiquadFilter();
        soften.type = 'lowpass';
        soften.frequency.value = 1000;
        soften.Q.value = 0.45;
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.ratio.value = 3;
        master.connect(soften);
        soften.connect(compressor);
        compressor.connect(context.destination);
        room = context.createConvolver();
        const length = Math.floor(context.sampleRate * 2.5),
          impulse = context.createBuffer(2, length, context.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
          const samples = impulse.getChannelData(channel);
          for (let i = 0; i < length; i++)
            samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.5) * 0.35;
        }
        room.buffer = impulse;
        wet = context.createGain();
        wet.gain.value = 0.2;
        room.connect(wet);
        wet.connect(master);
        mix = makeMix(1);
        const opening = context;
        opening.addEventListener('statechange', () => {
          if (context !== opening) return;
          if (opening.state === 'closed') {
            clearInterval(interval);
            interval = null;
          }
          startScore(opening);
        });
      }
      const opening = context;
      const resumed = opening.resume();
      startScore(opening);
      await resumed;
      startScore(opening);
    } catch {
      // A later user gesture can retry playback when autoplay is restricted.
    }
  }
  function toggle() {
    enabled = !enabled;
    reflect();
    if (enabled) return ensurePlaying();
    clearInterval(interval);
    interval = null;
    if (context) {
      const closing = context;
      context = null;
      master.gain.cancelScheduledValues(closing.currentTime);
      master.gain.setTargetAtTime(0.0001, closing.currentTime, 0.08);
      setTimeout(() => {
        closing.close().catch(() => {});
      }, 400);
    }
  }
  button.addEventListener('click', toggle);
  const unlock = (event) => {
    if (!event.target.closest('#music-toggle')) ensurePlaying();
  };
  document.addEventListener('pointerdown', unlock, { capture: true });
  document.addEventListener('pointerup', unlock, { capture: true });
  document.addEventListener('touchend', unlock, { capture: true, passive: true });
  document.addEventListener('click', unlock, { capture: true });
  document.addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!enabled || !context) return;
    if (document.hidden) context.suspend().catch(() => {});
    else ensurePlaying().then(schedule);
  });
  reflect();
  // Attempt autoplay where allowed, otherwise the first menu interaction unlocks it.
  if (enabled) ensurePlaying();
})();
