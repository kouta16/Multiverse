/* Multiverse audio engine — procedural SFX + heroic background music via Web Audio API. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Audio = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ctx = null;
  var master = null;
  var musicGain = null;
  var muted = false;
  var musicOn = true;
  var musicTimer = null;

  function ensureCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.18;
      musicGain.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ctx) return;
    var t0 = when || now();
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol, when, filterFreq, slideTo, type) {
    if (!ctx) return;
    var t0 = when || now();
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var f = ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.setValueAtTime(filterFreq || 1200, t0);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  /* ===== music helpers ===== */
  function pad(freqs, dur, vol) {
    if (!ctx) return;
    var t0 = now();
    for (var i = 0; i < freqs.length; i++) {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freqs[i];
      osc.detune.value = (Math.random() - 0.5) * 5;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.8);
      g.gain.setValueAtTime(vol, t0 + dur * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(musicGain);
      osc.start(t0); osc.stop(t0 + dur + 0.2);
    }
  }

  /* warm horn-like lead for heroic melodies */
  function horn(freq, dur, vol, when) {
    if (!ctx) return;
    var t0 = when || now();
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.04);
    g.gain.setValueAtTime(vol * 0.7, t0 + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(musicGain);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  /* ===== voice memes (linked from myinstants) ===== */
  var MEME_MAP = {
    'vine-boom': { name: 'VINE BOOM 💥', url: '/audio/vine-boom.mp3' },
    'movie_1': { name: 'BRUH', url: '/audio/movie_1.mp3' },
    'gta-v-death-sound-effect-102': { name: 'GTA Wasted 🎮', url: '/audio/gta-v-death-sound-effect-102.mp3' },
    'anime-wow-sound-effect': { name: 'أنمي واو', url: '/audio/anime-wow-sound-effect.mp3' },
    'tf_nemesis': { name: 'كمان حزينه 🎻', url: '/audio/tf_nemesis.mp3' },
    'dry-fart': { name: 'فرطوعة 💨', url: '/audio/dry-fart.mp3' },
    'chicken-on-tree-screaming': { name: 'الفرخة بتصرخ 🐔', url: '/audio/chicken-on-tree-screaming.mp3' },
    'y-m-gwr-krwn-mshkl': { name: 'يا عم غور كروان', url: '/audio/y-m-gwr-krwn-mshkl.mp3' },
    'kln-ndn-wnt-m-ndksh': { name: 'كلنا عندنا', url: '/audio/kln-ndn-wnt-m-ndksh.mp3' },
    'mt-ytsh': { name: 'متعيطش', url: '/audio/mt-ytsh.mp3' },
    'bhjt-sbr-rage-mode': { name: 'بهجت ريج مود', url: '/audio/bhjt-sbr-rage-mode.mp3' },
    'nt-wllh-dmk-tqyl': { name: 'إنت والله دمك تقيل', url: '/audio/nt-wllh-dmk-tqyl.mp3' },
    'nwqt-dy-l-wdy': { name: 'نقطة ضياء', url: '/audio/nwqt-dy-l-wdy.mp3' },
    'smw-lykw': { name: 'سامو عليكو', url: '/audio/smw-lykw.mp3' },
    'zgrwth': { name: 'زغرودة', url: '/audio/zgrwth.mp3' }
  };
  var memeAudio = null;

  function playMeme(id) {
    if (muted) return;
    var m = MEME_MAP[id];
    if (!m) return;
    if (memeAudio) { memeAudio.pause(); memeAudio.src = ''; }
    memeAudio = document.createElement('audio');
    memeAudio.preload = 'auto';
    memeAudio.src = m.url;
    memeAudio.volume = muted ? 0 : 0.9;
    memeAudio.onerror = function () {
      if (typeof Render !== 'undefined' && Render.toast) {
        Render.toast('مشكلة في تحميل صوت الميم', true);
      }
    };
    var p = memeAudio.play();
    if (p && p.catch) p.catch(function () {});
  }

  function memeList() {
    var list = [];
    for (var k in MEME_MAP) if (MEME_MAP.hasOwnProperty(k)) list.push({ id: k, name: MEME_MAP[k].name });
    return list;
  }

  var api = {
    unlock: function () {
      ensureCtx();
      api.startMusic();
    },
    toggleMute: function () {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.9;
      return muted;
    },
    toggleMusic: function () {
      musicOn = !musicOn;
      if (musicGain) musicGain.gain.value = musicOn ? 0.18 : 0;
      return musicOn;
    },
    isMuted: function () { return muted; },
    isMusicOn: function () { return musicOn; },
    playMeme: playMeme,
    memeList: memeList,

    click: function () { ensureCtx(); tone(660, 0.08, 'triangle', 0.25); },
    select: function () { ensureCtx(); tone(880, 0.06, 'sine', 0.15); },
    hover: function () { ensureCtx(); tone(1400, 0.02, 'sine', 0.04); },
    pick: function () { ensureCtx(); tone(520, 0.12, 'triangle', 0.3); tone(780, 0.14, 'triangle', 0.25, now() + 0.08); },
    place: function () {
      ensureCtx();
      noise(0.18, 0.5, null, 900, 200);
      tone(140, 0.16, 'sine', 0.5, null, 90);
    },
    draw: function () {
      ensureCtx();
      tone(700, 0.07, 'triangle', 0.2, null, 1100);
      noise(0.08, 0.15, null, 3000, 6000, 'highpass');
    },
    reveal: function () {
      ensureCtx();
      noise(0.6, 0.35, null, 300, 3000);
      tone(220, 0.5, 'sawtooth', 0.12, null, 880);
      tone(330, 0.5, 'sawtooth', 0.08, now() + 0.05, 1320);
    },
    point: function () {
      ensureCtx();
      tone(784, 0.16, 'sine', 0.3); tone(988, 0.16, 'sine', 0.3, now() + 0.09); tone(1319, 0.24, 'sine', 0.3, now() + 0.18);
    },
    win: function () {
      ensureCtx();
      var notes = [523, 659, 784, 1047, 1319];
      for (var i = 0; i < notes.length; i++) tone(notes[i], 0.4, 'triangle', 0.3, now() + i * 0.13);
      noise(0.8, 0.2, now() + 0.3, 2000, 8000, 'highpass');
    },
    eliminate: function () {
      ensureCtx();
      tone(392, 0.3, 'sawtooth', 0.18, null, 196);
      tone(294, 0.4, 'sawtooth', 0.15, now() + 0.12, 147);
    },
    startGame: function () {
      ensureCtx();
      tone(440, 0.15, 'triangle', 0.3); tone(554, 0.15, 'triangle', 0.3, now() + 0.12); tone(659, 0.25, 'triangle', 0.3, now() + 0.24);
    },
    error: function () { ensureCtx(); tone(220, 0.15, 'square', 0.15, null, 180); },

    /* Loki steal: sneaky snatch + evil sting */
    steal: function () {
      ensureCtx();
      tone(440, 0.08, 'sine', 0.22, null, 620);
      tone(620, 0.08, 'sine', 0.22, now() + 0.07, 830);
      noise(0.12, 0.35, now() + 0.12, 2500, 5500, 'highpass');
      tone(880, 0.2, 'triangle', 0.3, now() + 0.15, 1245);
      tone(1175, 0.18, 'triangle', 0.22, now() + 0.22, 1568);
    },

    /* Reverse Flash rescue (save the played card): rewind swoosh + shimmer */
    save: function () {
      ensureCtx();
      noise(0.45, 0.3, null, 6000, 250);
      tone(1500, 0.4, 'sawtooth', 0.07, null, 250);
      tone(2500, 0.35, 'sine', 0.1, now() + 0.05, 500);
      tone(988, 0.25, 'triangle', 0.22, now() + 0.32, 1319);
      tone(1319, 0.2, 'triangle', 0.16, now() + 0.4, 1760);
    },

    /* Reverse Flash swap: time-jump zap */
    swap: function () {
      ensureCtx();
      tone(300, 0.28, 'sawtooth', 0.14, null, 1500);
      noise(0.2, 0.28, now() + 0.1, 600, 4200, 'bandpass');
      tone(1500, 0.12, 'sine', 0.18, now() + 0.16, 250);
      tone(392, 0.2, 'square', 0.09, now() + 0.22, 784);
    },

    /* Two-Face: double card draw flourish */
    twoFace: function () {
      ensureCtx();
      tone(520, 0.09, 'triangle', 0.25, null, 780);
      tone(780, 0.09, 'triangle', 0.22, now() + 0.08, 1040);
      tone(1040, 0.12, 'triangle', 0.2, now() + 0.16, 1560);
      noise(0.25, 0.18, now() + 0.1, 2000, 6000, 'highpass');
    },

    /* Hela: dark destruction — descending sting + low boom */
    hela: function () {
      ensureCtx();
      tone(880, 0.16, 'triangle', 0.25, null, 440);
      tone(440, 0.18, 'triangle', 0.25, now() + 0.12, 220);
      tone(220, 0.28, 'sawtooth', 0.18, now() + 0.24, 110);
      noise(0.35, 0.3, now() + 0.28, 300, 2500, 'lowpass');
    },

    /* Kilgrave: mind control — eerie shimmering whisper */
    kilgrave: function () {
      ensureCtx();
      tone(660, 0.2, 'sine', 0.16, null, 700);
      tone(880, 0.24, 'sine', 0.16, now() + 0.1, 830);
      tone(550, 0.3, 'triangle', 0.14, now() + 0.22, 520);
      noise(0.4, 0.12, now() + 0.26, 3500, 900, 'bandpass');
    },

    /* Riddler: mysterious riddle peek — quick sparkle + question wiggle */
    riddler: function () {
      ensureCtx();
      tone(520, 0.07, 'square', 0.16, null, 520);
      tone(660, 0.07, 'square', 0.16, now() + 0.08, 660);
      tone(520, 0.09, 'square', 0.16, now() + 0.16, 520);
      tone(880, 0.2, 'triangle', 0.24, now() + 0.26, 1175);
      noise(0.22, 0.16, now() + 0.3, 2500, 7000, 'highpass');
    },

    /* Mr. Freeze: ice — glassy high shards + crackling frost */
    mrFreeze: function () {
      ensureCtx();
      tone(1800, 0.18, 'sine', 0.14, null, 600);
      tone(2200, 0.16, 'sine', 0.12, now() + 0.1, 900);
      tone(1400, 0.22, 'triangle', 0.16, now() + 0.2, 500);
      noise(0.3, 0.2, now() + 0.24, 8000, 1500, 'highpass');
    },

    /* Translucent: vanish — soft shimmer + upward sweep into silence */
    translucent: function () {
      ensureCtx();
      tone(660, 0.12, 'sine', 0.18, null, 560);
      tone(880, 0.12, 'sine', 0.18, now() + 0.08, 740);
      noise(0.3, 0.25, now() + 0.14, 2500, 7000, 'highpass');
      tone(1245, 0.25, 'triangle', 0.14, now() + 0.22, 360);
      tone(1760, 0.35, 'sine', 0.08, now() + 0.34, 200);
    },

    /* Coins: happy win chime */
    coins: function () {
      ensureCtx();
      tone(988, 0.09, 'triangle', 0.25, null, 1319);
      tone(1319, 0.09, 'triangle', 0.25, now() + 0.09, 1760);
      tone(1760, 0.16, 'triangle', 0.22, now() + 0.18, 2349);
      tone(2349, 0.3, 'sine', 0.16, now() + 0.3, 3136);
    },

    /* ===== background music: heroic original theme ===== */
    startMusic: function () {
      ensureCtx();
      if (!ctx || musicTimer) return;
      // Heroic procedural theme in A minor: warm pads + horn phrases that evolve.
      var NOTE = { A3: 220.00, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00 };
      var CHORDS = [
        [110.0, 164.81, 220.0],     // Am
        [98.0, 146.83, 196.0],      // G
        [130.81, 196.0, 261.63],    // C
        [87.31, 130.81, 174.61],    // F
        [65.41, 98.0, 130.81]       // Dm
      ];
      var HEROIC = [
        ['A3', 0.16], ['C4', 0.16], ['E4', 0.16], ['A4', 0.42], ['E4', 0.16], ['C4', 0.16], ['D4', 0.42],
        ['E4', 0.16], ['F4', 0.16], ['E4', 0.16], ['D4', 0.42], ['C4', 0.16], ['D4', 0.16], ['C4', 0.16], ['A3', 0.6]
      ];
      var CALL_RESPONSE = [
        ['A4', 0.14], ['G4', 0.14], ['F4', 0.14], ['E4', 0.14], ['D4', 0.3], ['E4', 0.14], ['F4', 0.14], ['G4', 0.3],
        ['E4', 0.14], ['D4', 0.14], ['C4', 0.5]
      ];
      var RISING = [
        ['A3', 0.1], ['B3', 0.1], ['C4', 0.1], ['D4', 0.1], ['E4', 0.1], ['F4', 0.1], ['G4', 0.1], ['A4', 0.34]
      ];
      function playPhrase(notes, startT, vol) {
        var t = startT;
        for (var i = 0; i < notes.length; i++) {
          var n = notes[i];
          horn(NOTE[n[0]], n[1] * 1.1, vol, t);
          t += n[1];
        }
      }
      var lastChord = -1;
      function step() {
        if (!ctx) { return; }
        musicTimer = null;
        if (!musicOn) { musicTimer = setTimeout(step, 2000); return; }
        if (Math.random() < 0.15) {
          musicTimer = setTimeout(step, 700 + Math.random() * 1300);
          return;
        }
        var ch;
        var guard = 0;
        do { ch = Math.floor(Math.random() * CHORDS.length); } while (ch === lastChord && guard++ < 5);
        lastChord = ch;
        var durMs = 4600 + Math.random() * 1200;
        var dur = durMs / 1000;
        var t0 = now();
        pad(CHORDS[ch], dur, 0.4);
        var r = Math.random();
        if (r < 0.5) playPhrase(HEROIC, t0 + 0.4, 0.28);
        else if (r < 0.75) playPhrase(CALL_RESPONSE, t0 + 0.4, 0.24);
        else if (r < 0.9) playPhrase(RISING, t0 + 0.4, 0.2);
        musicTimer = setTimeout(step, durMs * 0.95);
      }
      step();
    },
    stopMusic: function () {
      if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
    }
  };

  api.musicGainRef = function () { return musicGain; };

  return api;
});