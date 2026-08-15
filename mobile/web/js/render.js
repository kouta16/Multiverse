/* Multiverse renderer — red Origami theme: hex seats, battle area, hero cards. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Render = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STAT_COLORS = { attack: '#ff6b6b', intelligence: '#4cc9f0', defense: '#06d6a0' };
  var ICONS = {
    attack: '<path d="M14.5 3l2.5 2.5-9.5 9.5L5 17.5 6.5 19l2.5-2.5L18.5 7 21 9.5V3z"/><path d="M11 6L6 11l-1.5 4.5L9 14l2-2"/>',
    intelligence: '<path d="M12 2a5 5 0 0 0-3 9.1V15a3 3 0 0 0 6 0v-3.9A5 5 0 0 0 12 2z"/><path d="M9 18c0 1.7 1.3 3 3 3s3-1.3 3-3"/><path d="M9.5 20.5h5"/>',
    defense: '<path d="M12 2L4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z"/>'
  };
  var LABELS = { attack: 'هجوم', intelligence: 'ذكاء', defense: 'دفاع' };
  var ORDINAL = ['', 'الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة',
    'الحادية عشرة', 'الثانية عشرة', 'الثالثة عشرة', 'الرابعة عشرة', 'الخامسة عشرة', 'السادسة عشرة', 'السابعة عشرة', 'الثامنة عشرة', 'التاسعة عشرة', 'العشرون'];
  function roundName(n) { return 'الجولة ' + (ORDINAL[n] || ('رقم ' + n)); }
  var RARITY_NAMES = { common: 'عادي', rare: 'نادر', epic: 'ملحمي', legendary: 'أسطوري' };
  var SPECIAL_NAMES = { steal: 'لوكي: يسرق', swap: 'Reverse Flash', twoface: 'توو فيس: +2 سحب', hela: 'هيلا: تقتل كارت', kilgrave: 'Kilgrave: سيطرة', riddler: 'Riddler: كشف كارت', mrfreeze: 'Mr. Freeze: تجميد', blacknoir: 'Black Noir: بدّل النقط', translucent: 'Translucent: اختفاء جولتين' };

  var state = {
    myId: null,
    isAiMode: false,
    online: false,
    snap: null,
    lastPhase: null,
    lastRound: 0,
    shownRevealRound: 0,
    endShown: false,
    lastHandKey: '',
    lastSeatsKey: '',
    lastTurnPlayerId: null,
    selected: new Set(),
    swapPicked: null,
    swapCards: [],
    dragged: false,
    seatPos: {},
    handlers: { onType: null, onPlay: null, onContinue: null, onSwap: null, onLoki: null, onTwoFace: null, onHela: null, onKilgrave: null, onKilgravePick: null, onRiddler: null, onMrFreeze: null, onMrFreezePick: null, onTranslucent: null, onSave: null, onSkip: null }
  };

  function icon(stat, cls) {
    return '<svg viewBox="0 0 24 24" class="' + (cls || 'ic') + '">' + ICONS[stat] + '</svg>';
  }

  function q(id) { return document.getElementById(id); }

  /* ===== background particles ===== */
  function startBackground() {
    var canvas = q('bg-canvas');
    var ctx = canvas.getContext('2d');
    var W, H, parts = [], raf = null;
    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    var count = Math.min(70, Math.floor(W / 16));
    for (var i = 0; i < count; i++) {
      parts.push({
        x: Math.random() * W, y: Math.random() * H,
        r: 0.6 + Math.random() * 2.0,
        vy: 0.08 + Math.random() * 0.5,
        vx: (Math.random() - 0.5) * 0.2,
        hue: Math.random() < 0.55 ? 45 : (Math.random() < 0.5 ? 0 : 14),
        a: 0.12 + Math.random() * 0.45,
        tw: Math.random() * Math.PI * 2
      });
    }
    function frame() {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.y -= p.vy; p.x += p.vx; p.tw += 0.03;
        if (p.y < -8) { p.y = H + 8; p.x = Math.random() * W; }
        if (p.x < -8) p.x = W + 8; if (p.x > W + 8) p.x = -8;
        var alpha = p.a * (0.6 + 0.4 * Math.sin(p.tw));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'hsla(' + p.hue + ',85%,45%,' + alpha + ')';
        ctx.fill();
        ctx.shadowColor = 'hsla(' + p.hue + ',85%,45%,0.35)';
        ctx.shadowBlur = 6;
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(frame);
    }
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function showScreen(name) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
    q('screen-' + name).classList.add('active');
  }

  /* make an absolutely-positioned element draggable (mouse + touch) */
  function makeDraggable(el, opts) {
    if (!el || el._draggable) return;
    opts = opts || {};
    el._draggable = true;
    var dragging = false;
    function onDown(e) {
      if (e.target && e.target.closest && e.target.closest('button, a, input, select')) return;
      var pt = e.touches ? e.touches[0] : e;
      var parent = el.offsetParent || document.body;
      var rect = el.getBoundingClientRect();
      var pRect = parent.getBoundingClientRect();
      var startX = pt.clientX, startY = pt.clientY;
      var origLeft = rect.left - pRect.left;
      var origTop = rect.top - pRect.top;
      dragging = true;
      el.classList.add('dragging');
      el.style.transition = 'none';
      function onMove(ev) {
        if (!dragging) return;
        var t = ev.touches ? ev.touches[0] : ev;
        var dx = t.clientX - startX, dy = t.clientY - startY;
        el.style.left = (origLeft + dx) + 'px';
        el.style.top = (origTop + dy) + 'px';
        el.style.transform = 'none';
        el.style.margin = '0';
        if (opts.onDrag) opts.onDrag(el);
      }
      function onUp() {
        if (!dragging) return;
        dragging = false;
        el.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
      e.preventDefault();
    }
    el.addEventListener('mousedown', onDown);
    el.addEventListener('touchstart', onDown, { passive: false });
  }

  function toast(msg) {
    var t = q('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.remove('show'); }, 4500);
    logAdd(msg);
  }

  /* ===== event log (history of every toast notification, toggleable) ===== */
  var eventLog = [];
  var MAX_LOG = 120;
  function twoDigits(n) { return n < 10 ? '0' + n : '' + n; }

  function logAdd(msg) {
    var d = new Date();
    eventLog.unshift({ time: twoDigits(d.getHours()) + ':' + twoDigits(d.getMinutes()) + ':' + twoDigits(d.getSeconds()), msg: msg });
    if (eventLog.length > MAX_LOG) eventLog.pop();
    refreshLogBadge();
    var p = q('log-panel');
    if (p && !p.classList.contains('hidden')) renderLog();
  }

  function refreshLogBadge() {
    var b = q('log-badge');
    if (!b) return;
    var n = eventLog.length;
    b.classList.toggle('hidden', n === 0);
    b.textContent = n > 99 ? '99+' : n;
  }

  function renderLog() {
    var list = q('log-list');
    if (!list) return;
    list.innerHTML = '';
    if (!eventLog.length) {
      var empty = document.createElement('div');
      empty.className = 'log-empty';
      empty.textContent = 'مفيش أحداث حتى الآن';
      list.appendChild(empty);
      return;
    }
    for (var i = 0; i < eventLog.length; i++) {
      var row = document.createElement('div');
      row.className = 'log-item';
      var tm = document.createElement('span');
      tm.className = 'log-time';
      tm.textContent = eventLog[i].time;
      var ms = document.createElement('span');
      ms.className = 'log-msg';
      ms.textContent = eventLog[i].msg;
      row.appendChild(tm);
      row.appendChild(ms);
      list.appendChild(row);
    }
  }

  function toggleLog(force) {
    var p = q('log-panel'), btn = q('log-btn');
    if (!p || !btn) return;
    var show = force == null ? p.classList.contains('hidden') : !!force;
    if (show) {
      p.classList.remove('hidden');
      btn.classList.add('open');
      renderLog();
    } else {
      p.classList.add('hidden');
      btn.classList.remove('open');
    }
  }

  function initLogUI() {
    var btn = q('log-btn');
    if (!btn) return;
    btn.addEventListener('click', function () { if (window.Audio && Audio.click) Audio.click(); toggleLog(); });
    var close = q('log-close');
    if (close) close.addEventListener('click', function () { toggleLog(false); });
    var clear = q('log-clear');
    if (clear) clear.addEventListener('click', function () {
      eventLog.length = 0;
      refreshLogBadge();
      var p = q('log-panel');
      if (p && !p.classList.contains('hidden')) renderLog();
    });
    refreshLogBadge();
  }
  initLogUI();

  /* ===== emoji reactions & random taunts ===== */
  var REACTIONS = {
    win: [
      'كنت عارف إنها هتظبط 😏',
      'كنت حاسبها 😎',
      'كده أنا تمام 😎',
      'جت زي ما حسبتها 😏',
      'دا الي كنت مستنيه 😎',
      'من غير ما افكر حتى 😏',
      'Done 😎',
      'الي بعده 😏',
      'تفعيل وضع التركيز 😎',
      'دارت يا صيع 😏'
    ],
    lose: [
      'شت 😐',
      'راح الكارت عليا 😭',
      'ماحسبتهاش دي 😭',
      'ازاي دا حصل 😐',
      'كنت فاكرها مضمونة 😭',
      'غلطتي دي 😤',
      'متعوضه 😭',
      'طب تيجي ازاي 😐',
      'العب ايه تاني يعني 😭',
      'تتعوض المرة الجاية 😅'
    ],
    stolen: [
      'هو إنت خدت كرتي؟ 😐',
      'رجّع الكارت اللي خدته 😤',
      'ده كان أهم كارت عندي 😭',
      'إنت سرقت الكارت بتاعي؟ 😐',
      'طب ما تسيبلي حاجة 😂',
      'أخدت الكارت ليه بس؟ 😭',
      'يا لوكي، مش كده 😤',
      'ده إنت داخل تسرق وخلاص 😂',
      'طب خد الباقي كمان 😂',
      'كده أنا اتسرقت رسمي 😭'
    ],
    hurry: [
      'أنجز يا معلم 😅',
      'أنجز يازميلي 😏',
      'بسرعة يا نجم 🏃',
      'لسا قدامك كتير؟ 😐',
      'مش بتلعب ضربة جزاء, اخلص بقى 😤',
      'أنجز، كدا كدا انا الكسبان 😎',
      'لا اخلص احنا بننام بدري'
    ],
    stealer: [
      'بقى كارتي خلاص 😏',
      'جاي في وقته 😎',
      'حلو قوي دا 😏',
      'خدت الكارت 😎',
      'شكرًا على الكارت 🙏😏',
      'مش ضايع منك كارت ولا حاجة 😂',
      'خدت الكارت الصح 😏',
      'شكرا على تبرعك 😂'
    ],
    destroyer: [
      'كارتك مات 😈',
      'ودع الكارت 😤',
      'خلاص راح عليك 😈',
      'كارتك ودع الملاعب 😈',
      'تم توديع الكارت بنجاح 😈',
      'كدا نبقى خالصين 😤',
      'حسيت انك مش محتاجه 😈',
      'عليا و على اعدائي 😂'
    ],
    hela_target: [
      'ليه الكارت دا بالذات؟ 😭',
      'كان يستاهل يعني ؟ 😐',
      'ده أهم كارت عندي 😭',
      'هيلا 😤',
      'سلام سلام يا كارتي 😭',
      'مش كده بقى 😤',
      'اشمعنى انا يعم؟ 😐',
      'راح خلاص 😭'
    ],
    controller: [
      'هتلعب الي انا عاوزه 😈',
      'دلوقتي أنا اللي بقولك 😎',
      'الحركة دي بقى من عندي 😈',
      'هتتحرك زي ما أنا عايز 😏',
      'كارتك بقى تحت إمرتي 😈',
      'على راحتي بقى 😎',
      'يلا، العب خليك مطيع 😈'
    ],
    controlled: [
      'انا مين بيتحكم فيا 😨',
      'شت 😐',
      'شكرا يا عم كيلجريف 😤',
      'طب كنت اختارت الي جمبه 😩',
      'خلاص كدا باظت 😱',
      'هوا مافيش غيري ولا ايه 😐',
      '😤',
      'طب ماتيجي تلعب بدالي  😐'
    ],
    inspector: [
      'شفت كروتكم 😏',
      'كل حاجة بقت واضحة  😎',
      'ايه الي انا شوفته دا 😐',
      'شوفت حاجات مهمة 😏',
      'كل واحد يخلي باله من كروته 😎',
      'عارف الي معاكم 😈',
      'تم الكشف بنجاح 😏',
      'شايف كل حاجة من تحت النظارة 😎'
    ],
    freezer: [
      'كارتك هيتجمد جولتين 😈',
      'برد شديد جدًا ❄️😏',
      'كارتك في التلاجة ❄️',
      'مش انا دا مستر فريز بيمسي 😂',
      'تخليص حق ❄️😈',
      'كارتك في الديب فريزر 😎',
      'الجو سقعة خالص ❄️',
      'حاسس اني جمدت احسن كروتك 😈'
    ],
    frozen: [
      'الجو سقعة يا عم 🥶',
      'كدا كدا كنت حران 🥶',
      '😤',
      'جمدته ليه بس 🥶',
      'دا هوا الي حيلتي 😐',
      'هتتردلك 🥶',
      'كداكدا هيرجعلي 😤',
      'ماتفكك مني ياعم 🥶'
    ],
    phantom: [
      'مد ايدك لو تقدر 👻',
      'اختفيت 👻',
      'ماحدش شايفني 😎',
      'موجود بس مش هتاخد بالك مني 👻',
      'بعيد عن الانظار  😎',
      'جرب تيجي جمبي 😏',
      'راجع بعد جولتين 👻',
      'انا الشبح 😎'
    ],
    twoface: [
      'كارتين كمان بعد اذنك 😎',
      'هوا دا الكلام 😏',
      'معلش بقا 😏',
      'On Fire 😎',
      'باركولي 🎉',
      'فكة تو فيس بعد اذنكم 😏',
      'كروتي دي ماحدش يجي جمبها 😎',
      'الحظ نار 😏'
    ],
    rescue: [
      'رجعت الكارت 😎',
      'بقدر ارجع بالزمن كمان 😏',
      'كارتي و رجعلي',
      'مش كل الي فات مات 😎',
      'استرجاع ناجح ✅',
      'أنا بغير التايم لاين 😏',
      'طب ما الافينجرز عملوها جت عليا ؟',
      'كارتي حبيبي تعالى 😎'
    ],
    noir: [
      'خد و هات يا صاحبي 😎',
      'النقط دي بتاعتك ؟ 😏',
      'تسلم عالنقط 😈',
      'تم تبديل النقط بنجاح 😎',
      'حظ اوفر بقى 😏',
      'ايه رايك 😈',
      'النقط راحت للي يستاهلها'
    ]
  };

  function seatEl(playerId) {
    var found = null;
    var seats = document.querySelectorAll('#seats .seat');
    for (var i = 0; i < seats.length; i++) if (seats[i].dataset.pid === playerId) { found = seats[i]; break; }
    return found;
  }

  function showReaction(playerId, kind, delay, prob) {
    if (state.online) return; // no automatic taunts in online mode
    if (Math.random() > (prob == null ? 0.9 : prob)) return;
    var pool = REACTIONS[kind] || REACTIONS.stolen;
    var text = pool[Math.floor(Math.random() * pool.length)];
    setTimeout(function () {
      // re-find the seat now: a re-render may have rebuilt the seats since
      var seat = seatEl(playerId);
      if (!seat) return;
      var rect = seat.getBoundingClientRect();
      if (!rect.width) return;
      var b = document.createElement('div');
      b.className = 'reaction';
      b.innerHTML = '<div class="r-text">' + esc(text) + '</div>';
      b.style.left = (rect.left + rect.width / 2) + 'px';
      b.style.top = (rect.top - 6) + 'px';
      document.body.appendChild(b);
      setTimeout(function () { b.classList.add('out'); }, 4000);
      setTimeout(function () { b.remove(); }, 5100);
    }, delay == null ? 0 : delay);
  }

  function regainSeatEl(playerId) {
    var found = null;
    var seats = document.querySelectorAll('#seats .seat');
    for (var i = 0; i < seats.length; i++) if (seats[i].dataset.pid === playerId) { found = seats[i]; break; }
    return found;
  }

  // chat message bubble shown above the sender's seat/avatar
  function showChatPop(m) {
    if (!m || !m.from) return;
    var seat = seatEl(m.from);
    if (!seat) return;
    var text = '';
    if (m.kind === 'emoji') text = m.emoji || '';
    else if (m.kind === 'sound') text = '🔊 ' + (m.soundName || m.sound || '');
    else text = m.text || '';
    if (!text) return;
    var rect = seat.getBoundingClientRect();
    if (!rect.width) return;
    var b = document.createElement('div');
    b.className = 'reaction chat-pop';
    if (m.kind === 'emoji') b.classList.add('big-emoji');
    b.innerHTML = '<div class="r-text">' + esc(text) + '</div>';
    b.style.left = (rect.left + rect.width / 2) + 'px';
    if (rect.top > 96) {
      b.style.top = (rect.top - 6) + 'px';
    } else {
      b.style.top = (rect.bottom + 8) + 'px';
      b.classList.add('below');
    }
    document.body.appendChild(b);
    setTimeout(function () { b.classList.add('out'); }, 4200);
    setTimeout(function () { b.remove(); }, 5400);
  }

  function stealReaction(byId, targetId) {
    // only the victim reacts (the one the special card was used on)
    showReaction(targetId, 'stolen', 250 + Math.random() * 350, 0.9);
  }

  // generic card-effect reaction: shown on the actor (self-taunt) or a victim seat
  function reaction(playerId, kind) {
    showReaction(playerId, kind, 250 + Math.random() * 350, 0.9);
  }

  function hurryReaction(snap) {
    var others = [];
    for (var i = 0; i < snap.players.length; i++) {
      var p = snap.players[i];
      if (p.id !== state.myId && !p.eliminated) others.push(p.id);
    }
    if (!others.length) return;
    showReaction(others[Math.floor(Math.random() * others.length)], 'hurry', 300 + Math.random() * 400, 1);
  }

  var hurryTimer = null;
  // keep nagging every 8s while I still haven't picked my cards
  function hurryNag() {
    var s = state.snap;
    var scr = q('screen-game');
    if (!scr || !scr.classList.contains('active')) { hurryTimer = null; return; }
    if (s && s.phase === 'playing' && s.currentPlayerId === state.myId && !isEliminated(s, state.myId)) {
      hurryReaction(s);
      hurryTimer = setTimeout(hurryNag, 8000);
    } else {
      hurryTimer = null;
    }
  }

  function scheduleHurry() {
    if (state.online) { clearTimeout(hurryTimer); hurryTimer = null; return; }
    clearTimeout(hurryTimer);
    hurryTimer = setTimeout(hurryNag, 10000);
  }

  function renderRulesHint() {
    // removed per request — no how-to-play box on the main screen
  }

  function setStatus(msg, isError) {
    var el = q('online-status');
    el.textContent = msg || '';
    el.classList.toggle('error', !!isError);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function playerName(snap, id) {
    for (var i = 0; i < snap.players.length; i++) if (snap.players[i].id === id) return snap.players[i].name;
    return '؟';
  }

  function isEliminated(snap, id) {
    for (var i = 0; i < snap.players.length; i++) if (snap.players[i].id === id) return snap.players[i].eliminated;
    return false;
  }

  /* ===== seats (hexagons) ===== */
  var SLOTS = {
    'top': { left: '50%', top: '9%', tx: '-50%' },
    'top-left': { left: '6%', top: '9%', tx: '0' },
    'top-right': { left: '94%', top: '9%', tx: '-100%' },
    'bottom-left': { left: '4%', bottom: '8%', tx: '0' }
  };

  function placeSeats(snap) {
    var me = null, others = [];
    for (var i = 0; i < snap.players.length; i++) {
      if (snap.players[i].id === state.myId) me = snap.players[i];
      else others.push(snap.players[i]);
    }
    var order = others.concat(me ? [me] : []);
    // opponents up top clustered around the center; my seat stays bottom-left
    var vw = window.innerWidth || 1280;
    var android = document.documentElement && document.documentElement.classList.contains('is-android');
    var gap = android ? Math.max(100, Math.round(vw * 0.16)) : Math.max(250, Math.round(vw * 0.16));

    var seats = q('seats');
    var key = snap.players.map(function (p) {
      return p.id + ':' + p.points + ':' + (p.eliminated ? 1 : 0) + ':' + p.handCount + ':' + p.playCount + ':' + (p.invisible ? 1 : 0);
    }).join('|');
    if (key === state.lastSeatsKey) return;
    state.lastSeatsKey = key;

    seats.innerHTML = '';
    for (var s = 0; s < order.length; s++) {
      var p = order[s];
      var pos;
      if (s === order.length - 1) {
        pos = SLOTS['bottom-left'];
      } else {
        var off = others.length === 1 ? 0 : (others.length === 2 ? gap / 2 : gap) * (s - (others.length - 1) / 2);
        var half = android ? 74 : 115;
        pos = { left: Math.round(vw / 2 + off - half) + 'px', top: '9%', tx: '' };
      }
      var seat = document.createElement('div');
      seat.className = 'seat' + (p.id === state.myId ? ' you' : '') + (p.eliminated ? ' elim' : '');
      seat.dataset.pid = p.id;
      seat.style.left = pos.left;
      seat.style.top = pos.top;
      seat.style.bottom = pos.bottom || '';
      seat.style.transform = 'translateX(' + (pos.tx || 0) + ')';
      // restore a dragged position if the player moved their seat earlier
      var saved = state.seatPos[p.id];
      if (saved) {
        seat.style.left = saved.left;
        seat.style.top = saved.top;
        seat.style.bottom = '';
        seat.style.transform = 'none';
      }
      makeDraggable(seat, { onDrag: function () {
        state.seatPos[p.id] = { left: seat.style.left, top: seat.style.top };
      } });
      var isTurn = !p.eliminated && snap.phase === 'playing' && snap.currentPlayerId === p.id;
      var isChooser = snap.phase === 'chooseType' && snap.chooserId === p.id;
      if (isTurn) seat.classList.add('turn');
      if (isChooser) seat.classList.add('chooser');

      var pips = '';
      for (var pp = 0; pp < snap.winPoints; pp++) {
        pips += '<span class="pip' + (pp < p.points ? ' on' : '') + '"></span>';
      }
      var playMinis = '';
      for (var m = 0; m < p.playCount; m++) playMinis += '<span class="mini"></span>';
      var sub;
      if (p.eliminated) {
        sub = 'خرج من اللعبة';
      } else {
        sub = (p.handCount === null ? '؟' : p.handCount + ' كروت') + (p.isAI ? ' • AI' : '');
        if (p.invisible) sub += ' • مختفي';
      }

      var avatarHtml = p.avatar
        ? '<img class="player-avatar-img" src="' + esc(p.avatar) + '" alt="">'
        : '<div class="player-avatar">' + esc((p.name || '؟').charAt(0)) + '</div>';

      seat.innerHTML =
        '<div class="seat-card"><div class="seat-inner">' +
          avatarHtml +
          '<div class="player-info-compact">' +
            '<div class="name">' + esc(p.name) + '</div>' +
            '<div class="sub">' + sub + '</div>' +
            '<div class="pips">' + pips + '</div>' +
            '<div class="seat-play">' + playMinis + '</div>' +
          '</div>' +
        '</div></div>';
      seats.appendChild(seat);
    }
  }

  /* ===== battle area + topbar ===== */
  function renderTop(snap) {
    var rn = roundName(snap.round);
    var extra = '';
    if (snap.roundType) extra = LABELS[snap.roundType] || '';
    if (snap.chooserId) {
      if (extra) extra += ' • ';
      extra += 'اختارها ' + playerName(snap, snap.chooserId);
    }
    q('tb-round').innerHTML = rn + (extra ? ' — ' + extra : '');
    var typeEl = q('tb-type');
    if (snap.roundType) {
      typeEl.textContent = LABELS[snap.roundType] || '';
      typeEl.style.color = STAT_COLORS[snap.roundType];
    } else {
      typeEl.textContent = '—';
      typeEl.style.color = '';
    }
    q('tb-decks').textContent = 'كومة: ' + snap.deckCount + ' • مهملة: ' + snap.discardCount;

    q('ba-round').textContent = rn + (extra ? ' — ' + extra : '');
    q('ba-decks').textContent = 'كومة: ' + snap.deckCount + ' • مهملة: ' + snap.discardCount;
    q('ba-icon-attack').classList.toggle('active', snap.roundType === 'attack');
    q('ba-icon-intelligence').classList.toggle('active', snap.roundType === 'intelligence');
    q('ba-icon-defense').classList.toggle('active', snap.roundType === 'defense');

    var status = q('tb-status');
    var baStatus = q('ba-status');
    if (snap.phase === 'chooseType') {
      if (snap.chooserId === state.myId) {
        status.textContent = 'دورك — اختار النوع';
        status.style.color = '#ffd700';
        baStatus.textContent = 'اختار نوع الراوند';
      } else {
        status.textContent = 'بيختار النوع: ' + playerName(snap, snap.chooserId);
        status.style.color = '';
        baStatus.textContent = playerName(snap, snap.chooserId) + ' بيختار النوع...';
      }
    } else if (snap.phase === 'playing') {
      if (snap.currentPlayerId === state.myId) {
        status.textContent = 'دورك — اختار كروت';
        status.style.color = '#ffd700';
        baStatus.textContent = 'مين ياخد أعلى ' + LABELS[snap.roundType] + '؟';
      } else {
        status.textContent = 'يلعب: ' + playerName(snap, snap.currentPlayerId);
        status.style.color = '';
        baStatus.textContent = playerName(snap, snap.currentPlayerId) + ' بيلعب...';
      }
    } else if (snap.phase === 'swap') {
      if (snap.swapPlayerId === state.myId) {
        status.textContent = 'دورك — Reverse Flash!';
        status.style.color = '#ffd700';
        baStatus.textContent = 'بدّل الكارت اللي لعبته بكارت من ايدك';
      } else {
        status.textContent = '';
        status.style.color = '';
        baStatus.textContent = playerName(snap, snap.swapPlayerId) + ' بيبدل كارت الـ Reverse Flash...';
      }
    } else if (snap.phase === 'preRound') {
      if (snap.phaseTurnId === state.myId) {
        status.textContent = 'مرحلة قبل الراوند — دورك';
        status.style.color = '#ffd700';
        baStatus.textContent = 'استخدم لوكي أو تخطي';
      } else {
        status.textContent = 'مرحلة قبل الراوند';
        status.style.color = '';
        baStatus.textContent = playerName(snap, snap.phaseTurnId) + ' بيقرر...';
      }
    } else if (snap.phase === 'postRound') {
      if (snap.phaseTurnId === state.myId) {
        status.textContent = 'مرحلة بعد الراوند — دورك';
        status.style.color = '#ffd700';
        baStatus.textContent = 'انقذ كارت أو تخطي';
      } else {
        status.textContent = 'مرحلة بعد الراوند';
        status.style.color = '';
        baStatus.textContent = playerName(snap, snap.phaseTurnId) + ' بيقرر...';
      }
    } else {
      status.textContent = '';
      status.style.color = '';
      baStatus.textContent = '';
    }
  }

  /* ===== hand ===== */
  function buildHand(hand, canSelect, roundType) {
    var wrap = q('hand');
    var key = hand.map(function (c) { return c.id; }).join(',');
    var rt = roundType || '';
    var rebuild = key !== state.lastHandKey || canSelect !== state.lastCanSelect || rt !== state.lastRoundType;
    if (!rebuild) {
      state.selected.forEach(function (id) {
        var el = wrap.querySelector('[data-id="' + id + '"]');
        if (el) el.classList.add('sel');
      });
      return;
    }
    if (key !== state.lastHandKey) state.selected = new Set();
    state.lastHandKey = key;
    state.lastCanSelect = canSelect;
    state.lastRoundType = rt;
    wrap.innerHTML = '';
    for (var i = 0; i < hand.length; i++) {
      wrap.appendChild(makeCardEl(hand[i], canSelect, roundType));
    }
    // Kilgrave-forced cards are auto-selected and stay selected
    for (var f = 0; f < hand.length; f++) {
      if (hand[f].forced) {
        state.selected.add(hand[f].id);
        var fel = wrap.querySelector('[data-id="' + hand[f].id + '"]');
        if (fel) fel.classList.add('sel');
      }
    }
    if (state.selected.size) updatePlayBtn();
    state.selected.forEach(function (id) {
      var el = wrap.querySelector('[data-id="' + id + '"]');
      if (el) el.classList.add('sel');
    });
    if (hand.length) {
      for (var d = 0; d < hand.length; d++) {
        (function (el) {
          setTimeout(function () { el.style.opacity = '1'; el.style.transform = ''; }, 40 + d * 30);
        })(wrap.children[d]);
      }
    }
  }

  function makeCardEl(card, canSelect, roundType) {
    var el = document.createElement('div');
    el.className = 'card enter';
    el.dataset.id = card.id;
    el.dataset.rarity = card.rarity || 'common';
    el.dataset.type = card.specialty || 'attack';
    el.dataset.cat = card.special ? 'special' : (card.bonus ? 'bonus' : 'char');
    el.style.opacity = '0';
    var rarityCls = 'rarity-' + (card.rarity || 'common');
    var imgHtml = card.img
      ? '<img class="card-img" src="' + card.img + '" alt="' + esc(card.name) + '" onerror="this.style.display=\'none\'">'
      : '';
    var fallbackHtml = '<div class="card-img-fallback" style="display:none">' + esc((card.name || '؟').substring(0, 2)) + '</div>';
    var bonusHtml = card.bonus ? '<div class="card-bonus">+' + card.bonus + '</div>' : '';
    var specialHtml = card.special ? '<div class="card-special-badge">' + (SPECIAL_NAMES[card.special] || card.special) + '</div>' : '';
    var forcedHtml = card.forced ? '<div class="card-forced-badge">مجبور!</div>' : '';
    var frozenHtml = card.frozen ? '<div class="card-frozen-badge">متجمد!</div>' : '';
    var statsHtml = (!card.special && !card.bonus)
      ? '<div class="card-stats">' +
          '<span class="st st-att"><small>هجوم</small><b>' + (card.attack || 0) + '</b></span>' +
          '<span class="st st-int"><small>ذكاء</small><b>' + (card.intelligence || 0) + '</b></span>' +
          '<span class="st st-def"><small>دفاع</small><b>' + (card.defense || 0) + '</b></span>' +
        '</div>'
      : '';
    if (card.frozen) el.classList.add('frozen');

    el.innerHTML =
      '<div class="inner">' +
        '<div class="face face-front">' +
          imgHtml + fallbackHtml +
          '<div class="card-rarity-glow"></div>' +
          '<div class="card-rarity-badge ' + rarityCls + '">' + (RARITY_NAMES[card.rarity] || card.rarity) + '</div>' +
          bonusHtml + specialHtml + forcedHtml + frozenHtml +
          '<div class="card-info">' +
            statsHtml +
            '<div class="card-name">' + esc(card.name) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="face face-back"><div class="emblem"><div class="ring"></div></div></div>' +
      '</div>';

    // fallback: if img missing/fails, show initials
    var img = el.querySelector('.card-img');
    var fb = el.querySelector('.card-img-fallback');
    if (!img) fb.style.display = 'flex';
    else img.addEventListener('error', function () { fb.style.display = 'flex'; });

    el.addEventListener('mouseenter', function () { Audio.hover(); });

    if (canSelect) {
      if (androidMode()) {
        el.addEventListener('click', function () {
          if (el.closest && el.closest('#hand')) openCardPreview(el, card);
          else toggleCard(el, card);
        });
      } else {
        el.addEventListener('click', function () { toggleCard(el, card); });
      }
    } else {
      if (androidMode()) {
        el.addEventListener('click', function () {
          if (el.closest && el.closest('#hand')) openCardPreview(el, card);
        });
      }
      el.classList.add('disable');
    }
    return el;
  }

  function toggleCard(el, card) {
    if (card.frozen) { toast('الكارت متجمد من Mr. Freeze — مش هتقدر تلعبه'); return; }
    if (card.forced && state.selected.has(card.id)) return; // forced: can't be deselected
    if (state.selected.has(card.id)) {
      state.selected.delete(card.id);
      el.classList.remove('sel');
    } else {
      state.selected.add(card.id);
      el.classList.add('sel');
      Audio.select();
    }
    updatePlayBtn();
  }

  function selectedIds() {
    return Array.from(state.selected);
  }

  function updatePlayBtn() {
    var btn = q('btn-play');
    if (btn) {
      btn.textContent = 'العب المختار (' + state.selected.size + ')';
      btn.classList.toggle('disabled', state.selected.size === 0);
    }
    renderPlayPill();
  }

  function clearHand() {
    q('hand').innerHTML = '';
    q('hand').style.transform = '';
    state.lastHandKey = '';
    state.selected = new Set();
  }

  /* ===== phone fit: scale the hand so it always fits its strip ===== */
  function androidMode() {
    return document.documentElement && document.documentElement.classList.contains('is-android');
  }

  function fitHand() {
    var hand = q('hand');
    var wrap = q('hand-wrap');
    if (!wrap || !hand) return;
    var cards = hand.children;
    if (!cards.length) { hand.style.transform = ''; return; }
    var avail = wrap.clientWidth || (window.innerWidth || 800) - 400;
    var natural = hand.scrollWidth || 0;
    var cardH = cards[0] && cards[0].offsetHeight ? cards[0].offsetHeight : 178;
    var s = natural > 0 ? avail / natural : 1;
    if (androidMode()) {
      var table = q('table');
      var tableH = table ? table.clientHeight : (window.innerHeight || 700) - 44;
      var maxH = Math.max(80, tableH * 0.56);
      s = Math.min(s, maxH / cardH);
    }
    s = Math.max(0.45, Math.min(1, s));
    hand.style.transformOrigin = 'bottom center';
    hand.style.transform = s >= 0.995 ? '' : 'scale(' + s.toFixed(3) + ')';
  }
  window.addEventListener('resize', fitHand);

  /* ===== phone only: play button pill (floats above the hand) ===== */
  function renderPlayPill() {
    var pill = q('play-pill');
    if (!pill) return;
    if (!androidMode() || !state.trayActive) { pill.classList.add('hidden'); return; }
    pill.classList.remove('hidden');
    pill.innerHTML = '';
    var n = state.selected.size;
    var b = document.createElement('button');
    b.className = 'btn btn-primary';
    b.textContent = n ? 'العب المختار (' + n + ')' : 'اختار كروت من ايدك';
    b.classList.toggle('disabled', n === 0);
    b.addEventListener('click', function () { Audio.click(); if (state.handlers.onPlay) state.handlers.onPlay(); });
    pill.appendChild(b);
  }

  /* ===== phone only: big card preview (tap a hand card to read it) ===== */
  function cardPreviewSize() {
    var h = Math.min(240, Math.round((window.innerHeight || 360) * 0.56));
    var w = Math.round(h * 0.686);
    return { w: w, h: h };
  }

  function openCardPreview(el, card) {
    var ov = q('card-preview');
    if (!ov) return;
    ov.innerHTML = '';
    ov.classList.remove('hidden');

    var big = el.cloneNode(true);
    big.classList.remove('enter', 'disable');
    big.style.opacity = '1';
    big.style.margin = '0';
    big.style.transform = 'none';
    big.style.position = 'relative';
    var sz = cardPreviewSize();
    big.style.width = sz.w + 'px';
    big.style.height = sz.h + 'px';
    big.style.setProperty('--card-w', sz.w + 'px');
    big.style.setProperty('--card-h', sz.h + 'px');

    var holder = document.createElement('div');
    holder.className = 'pv-body';
    holder.appendChild(big);

    var meta = document.createElement('div');
    meta.className = 'pv-meta';
    var nm = document.createElement('div');
    nm.className = 'pv-name';
    nm.textContent = card.name || '';
    meta.appendChild(nm);
    if (card.special) {
      var sp = document.createElement('div');
      sp.className = 'pv-sub';
      sp.textContent = 'كارت خاص: ' + (SPECIAL_NAMES[card.special] || card.special);
      meta.appendChild(sp);
    } else if (card.bonus) {
      var bo = document.createElement('div');
      bo.className = 'pv-sub';
      bo.textContent = '+' + card.bonus + ' على كل الاحصائيات';
      meta.appendChild(bo);
    }
    if (card.rarity && RARITY_NAMES[card.rarity]) {
      var ra = document.createElement('div');
      ra.className = 'pv-sub pv-rarity';
      ra.textContent = 'ندرة: ' + (RARITY_NAMES[card.rarity] || card.rarity);
      meta.appendChild(ra);
    }
    if (card.frozen) {
      var fr = document.createElement('div');
      fr.className = 'pv-sub pv-frozen';
      fr.textContent = 'متجمد من Mr. Freeze — مش هتتلعب المرة دي';
      meta.appendChild(fr);
    }

    var acts = document.createElement('div');
    acts.className = 'pv-actions';
    var canSel = card && !card.frozen;
    if (canSel && state.trayActive) {
      var go = document.createElement('button');
      go.className = 'btn btn-primary pv-go';
      go.textContent = state.selected.has(card.id) ? 'إلغاء الاختيار' : 'اختارها';
      go.addEventListener('click', function () {
        Audio.select();
        toggleCard(el, card);
        go.textContent = state.selected.has(card.id) ? 'إلغاء الاختيار' : 'اختارها';
      });
      acts.appendChild(go);
    }
    var back = document.createElement('button');
    back.className = 'btn btn-outline pv-back';
    back.textContent = 'رجوع';
    back.addEventListener('click', function () { Audio.click(); closeCardPreview(); });
    acts.appendChild(back);
    meta.appendChild(acts);

    holder.appendChild(meta);
    ov.appendChild(holder);
    ov.onclick = function (ev) { if (ev.target === ov) closeCardPreview(); };
  }

  function closeCardPreview() {
    var ov = q('card-preview');
    if (ov) ov.classList.add('hidden');
  }

  /* ===== phone only: my compact info badge (bottom-left) ===== */
  function renderMyBadge(snap) {
    var b = q('my-badge');
    if (!b) return;
    if (!androidMode()) { b.classList.add('hidden'); return; }
    var me = null;
    for (var i = 0; i < snap.players.length; i++) if (snap.players[i].id === state.myId) me = snap.players[i];
    if (!me) { b.classList.add('hidden'); return; }
    b.classList.remove('hidden');
    var pips = '';
    for (var pp = 0; pp < snap.winPoints; pp++) {
      pips += '<span class="pip' + (pp < (me.points || 0) ? ' on' : '') + '"></span>';
    }
    var av = me.avatar
      ? '<img class="player-avatar-img" src="' + esc(me.avatar) + '" alt="">'
      : '<div class="player-avatar">' + esc((me.name || '؟').charAt(0)) + '</div>';
    b.innerHTML =
      '<div class="mb-inner">' + av +
        '<div class="mb-info">' +
          '<div class="mb-name">' + esc(me.name) + '</div>' +
          '<div class="pips">' + pips + '</div>' +
        '</div>' +
      '</div>';
  }

  /* ===== type picker / action bar ===== */
  function renderTypePicker(snap) {
    var picker = q('type-picker');
    var show = snap.phase === 'chooseType' && snap.chooserId === state.myId && !isEliminated(snap, state.myId);
    picker.classList.toggle('hidden', !show);
    if (show && !picker._wired) {
      picker._wired = true;
      picker.querySelectorAll('.stat-btn').forEach(function (b) {
        b.addEventListener('click', function () {
          if (state.handlers.onType) state.handlers.onType(b.dataset.stat);
        });
      });
    }
  }

  function renderActionBar(snap) {
    var bar = q('action-bar');
    var btn = q('btn-play');
    var hint = q('play-hint');
    if (!bar._wired) {
      bar._wired = true;
      btn.addEventListener('click', function () {
        Audio.click();
        if (state.handlers.onPlay) state.handlers.onPlay();
      });
    }
    var show = snap.phase === 'playing' && snap.currentPlayerId === state.myId && !isEliminated(snap, state.myId);
    bar.classList.toggle('hidden', !show);
    if (show) {
      updatePlayBtn();
      btn.classList.toggle('disabled', state.selected.size === 0);
      hint.textContent = 'كارت على الأقل • كل كروتك = كل أو لا شيء!';
    }
  }

  /* ===== reveal overlay ===== */
  function showReveal(info) {
    var ov = q('reveal-overlay');
    ov.classList.remove('hidden');
    ov.innerHTML = '';
    var h = document.createElement('h2');
    h.textContent = 'الكشف!';
    ov.appendChild(h);

    var container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:12px;width:min(760px,94vw);';
    ov.appendChild(container);

    var rows = info.plays.slice();
    rows.forEach(function (row, idx) {
      var r = document.createElement('div');
      r.className = 'reveal-row' + (row.won ? ' winner' : '') + (row.eliminated ? ' eliminated' : '');
      var name = document.createElement('div');
      name.className = 'name';
      name.textContent = row.name;
      var cards = document.createElement('div');
      cards.className = 'cards';
      row.cards.forEach(function (c) {
        var mini = document.createElement('div');
        mini.className = 'reveal-mini flipping';
        if (row.forcedId === c.id) mini.classList.add('forced');
        mini.style.animationDelay = (0.3 + idx * 0.18) + 's';
        var img = c.img ? '<img src="' + c.img + '" alt="" onerror="this.style.display=\'none\'">' : '';
        var val = Multiverse.cardValue(c, info.roundType);
        var forcedTag = row.forcedId === c.id ? '<span class="forced-tag">Kilgrave</span>' : '';
        mini.innerHTML =
          '<div class="back"></div>' +
          '<div class="front">' + img + '<span class="val" style="color:' + STAT_COLORS[info.roundType] + '">' + val + '</span>' + forcedTag + '</div>';
        cards.appendChild(mini);
      });
      var total = document.createElement('div');
      total.className = 'total';
      total.textContent = row.total;
      var badge = document.createElement('div');
      badge.className = 'badge ' + (row.eliminated ? 'out' : (row.won ? 'win' : (row.skipped ? 'skip' : 'lose')));
      badge.textContent = row.eliminated ? 'خرج' : (row.won ? '+1 نقطة' : (row.skipped ? 'تخطي' : 'خسر'));
      r.appendChild(name); r.appendChild(cards); r.appendChild(total); r.appendChild(badge);
      container.appendChild(r);
    });

    var ctn = document.createElement('button');
    ctn.className = 'btn btn-primary';
    ctn.id = 'btn-reveal-continue';
    ctn.textContent = 'متابعة';
    ctn.disabled = true;
    setTimeout(function () { ctn.disabled = false; }, 1200 + rows.length * 180);
    ctn.addEventListener('click', function () {
      Audio.click();
      ov.classList.add('hidden');
      if (state.snap && state.snap.phase === 'ended') {
        state.endShown = false;
        showEnd(state.snap);
      } else if (state.handlers.onContinue) {
        state.handlers.onContinue();
      }
    });
    ov.appendChild(ctn);

    Audio.reveal();
    if (info.winners.length) setTimeout(function () { Audio.point(); }, 600);
    var hasElim = false;
    for (var i = 0; i < info.plays.length; i++) if (info.plays[i].eliminated) hasElim = true;
    if (hasElim) setTimeout(function () { Audio.eliminate(); }, 900);

    // Kilgrave user: remind them which card they forced
    for (var ki = 0; ki < info.plays.length; ki++) {
      var prow = info.plays[ki];
      if (prow.forcedBy && prow.forcedBy === state.myId && prow.forcedId) {
        var fcard = null;
        for (var kc = 0; kc < prow.cards.length; kc++) {
          if (prow.cards[kc].id === prow.forcedId) { fcard = prow.cards[kc]; break; }
        }
        if (fcard) {
          setTimeout(function (nm, cn) {
            toast('Kilgrave: جبرت ' + nm + ' يلعب ' + cn);
          }, 900, prow.name, fcard.name);
        }
        break;
      }
    }

    // Black Noir: the scores got swapped between the player and the chooser
    if (info.blackNoirSwaps && info.blackNoirSwaps.length) {
      setTimeout(function () {
        info.blackNoirSwaps.forEach(function (s) {
          var byName = '', withName = '';
          for (var bn = 0; bn < info.plays.length; bn++) {
            if (info.plays[bn].playerId === s.by) byName = info.plays[bn].name;
            if (info.plays[bn].playerId === s.with) withName = info.plays[bn].name;
          }
          toast('Black Noir بدّل النقط بين ' + (byName || '؟') + ' و ' + (withName || '؟'));
          showReaction(s.by, 'noir', 250 + Math.random() * 300, 0.9);
        });
      }, 1500);
    }

    // per-round reactions: 1-2 players only, like they're replying to each other
    setTimeout(function () {
      var winners = [], losers = [];
      info.plays.forEach(function (row) {
        if (row.won) winners.push(row.playerId);
        else if (!row.skipped && !row.eliminated) losers.push(row.playerId);
      });
      if (winners.length && Math.random() < 0.9) {
        showReaction(winners[Math.floor(Math.random() * winners.length)], 'win', 350 + Math.random() * 300, 1);
      }
      if (losers.length && Math.random() < 0.65) {
        showReaction(losers[Math.floor(Math.random() * losers.length)], 'lose', 1000 + Math.random() * 500, 1);
      }
    }, 400);
  }

  function hideReveal() {
    q('reveal-overlay').classList.add('hidden');
  }

  /* ===== swap overlay (Reverse Flash) ===== */
  function showSwap(snap, me) {
    var ov = q('swap-overlay');
    ov.classList.remove('hidden');
    ov.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'swap-box';

    var h3 = document.createElement('h3');
    h3.textContent = 'كارت الـ Reverse Flash!';
    var sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = 'بدّل الكارت اللي لعبته (المُسجل في مجموعك) بكارت من ايدك';
    box.appendChild(h3); box.appendChild(sub);

    var hand = document.createElement('div');
    hand.className = 'swap-hand';
    var handCards = me.hand || [];
    state.swapPicked = null;
    state.swapCards = handCards;

    handCards.forEach(function (c) {
      var el = makeCardEl(c, true, snap.roundType);
      el.classList.remove('enter');
      el.style.opacity = '1';
      el.addEventListener('click', function () {
        state.swapPicked = c.id;
        hand.querySelectorAll('.card').forEach(function (x) { x.classList.remove('selected'); });
        el.classList.add('selected');
        Audio.select();
      });
      hand.appendChild(el);
    });
    box.appendChild(hand);

    var actions = document.createElement('div');
    actions.className = 'swap-actions';
    var confirm = document.createElement('button');
    confirm.className = 'btn btn-primary';
    confirm.textContent = 'بدّل';
    confirm.addEventListener('click', function () {
      if (state.handlers.onSwap) state.handlers.onSwap(state.swapPicked);
    });
    var pass = document.createElement('button');
    pass.className = 'btn btn-outline';
    pass.textContent = 'من غير تبديل';
    pass.addEventListener('click', function () {
      if (state.handlers.onSwap) state.handlers.onSwap(null);
    });
    actions.appendChild(confirm); actions.appendChild(pass);
    box.appendChild(actions);
    ov.appendChild(box);
  }

  function hideSwap() {
    q('swap-overlay').classList.add('hidden');
  }

  /* ===== phase overlays (pre-round Loki / post-round Reverse Flash) ===== */
  function meIn(snap) {
    for (var i = 0; i < snap.players.length; i++) if (snap.players[i].id === state.myId) return snap.players[i];
    return null;
  }

  function countdownText(snap) {
    if (!snap.turnDeadline) return '';
    var secs = Math.max(0, Math.ceil((snap.turnDeadline - Date.now()) / 1000));
    return secs + ' ث';
  }

  function showPhaseOverlay(snap) {
    var ov = q('phase-overlay');
    ov.classList.remove('hidden');
    ov.innerHTML = '';
    var isPre = snap.phase === 'preRound';
    var me = meIn(snap);
    var myTurn = snap.phaseTurnId === state.myId && me && !me.eliminated;

    var box = document.createElement('div');
    box.className = 'phase-box';

    var h = document.createElement('h2');
    h.textContent = isPre ? 'مرحلة قبل الراوند' : 'مرحلة بعد الراوند';
    box.appendChild(h);

    var sub = document.createElement('div');
    sub.className = 'sub';
    var usable = [];
    if (me.hand) {
      var lostRF = snap.revealInfo && snap.revealInfo.winners.indexOf(state.myId) < 0;
      for (var u = 0; u < me.hand.length; u++) {
        var uc = me.hand[u];
        if (isPre && (uc.special === 'steal' || uc.special === 'twoface' || uc.special === 'hela' || uc.special === 'riddler' ||
          uc.special === 'mrfreeze' || uc.special === 'translucent' || (uc.special === 'kilgrave' && !snap.kilgraveUsed && snap.chooserId !== state.myId))) usable.push(uc);
        else if (!isPre && uc.special === 'swap' && lostRF) usable.push(uc);
      }
    }
    if (!myTurn) {
      sub.textContent = playerName(snap, snap.phaseTurnId) + ' بيقرر... (' + countdownText(snap) + ')';
    } else if (usable.length) {
      sub.textContent = 'في كروت خاصة تقدر تستخدمها (' + countdownText(snap) + ')';
    } else {
      sub.textContent = 'مافيش كروت (' + countdownText(snap) + ')';
    }
    box.appendChild(sub);

    if (myTurn) {
      var actions = document.createElement('div');
      actions.className = 'phase-actions';

      var skipBtn = document.createElement('button');
      skipBtn.className = 'btn btn-outline';
      skipBtn.textContent = 'تخطي';
      skipBtn.addEventListener('click', function () { Audio.click(); if (state.handlers.onSkip) state.handlers.onSkip(); });
      actions.appendChild(skipBtn);

      if (usable.length) {
        var useBtn = document.createElement('button');
        useBtn.className = 'btn btn-primary';
        useBtn.textContent = 'استخدم كارت';
        useBtn.addEventListener('click', function () {
          Audio.click();
          showSpecialPicker(snap, box, ov, usable);
        });
        actions.insertBefore(useBtn, actions.firstChild);
      }
      box.appendChild(actions);
    }
    ov.appendChild(box);
  }

  function showSpecialPicker(snap, box, ov, cards) {
    box.innerHTML = '';
    var h = document.createElement('h3');
    h.textContent = 'اختار الكارت اللي هتستخدمه';
    box.appendChild(h);
    var list = document.createElement('div');
    list.className = 'swap-hand';
    cards.forEach(function (c) {
      var el = makeCardEl(c, true, snap.roundType);
      el.classList.remove('enter');
      el.style.opacity = '1';
      el.style.margin = '0';
      el.addEventListener('click', function () {
        Audio.select();
        if (c.special === 'steal') showLokiTargets(snap, box, ov);
        else if (c.special === 'twoface') { if (state.handlers.onTwoFace) state.handlers.onTwoFace(); }
        else if (c.special === 'hela') showHelaTargets(snap, box, ov);
        else if (c.special === 'kilgrave') showKilgraveTargets(snap, box, ov);
        else if (c.special === 'mrfreeze') showMrFreezeTargets(snap, box, ov);
        else if (c.special === 'riddler') { if (state.handlers.onRiddler) state.handlers.onRiddler(); }
        else if (c.special === 'translucent') { if (state.handlers.onTranslucent) state.handlers.onTranslucent(); }
        else if (c.special === 'swap') showSaveUI(snap, box, ov);
      });
      list.appendChild(el);
    });
    box.appendChild(list);
    var back = document.createElement('button');
    back.className = 'btn btn-outline';
    back.textContent = 'رجوع';
    back.addEventListener('click', function () { Audio.click(); hidePhaseOverlay(); showPhaseOverlay(snap); });
    box.appendChild(back);
    ov.appendChild(box);
  }

  function showLokiTargets(snap, box, ov) {
    box.innerHTML = '';
    var h = document.createElement('h3');
    h.textContent = 'اختار الخصم اللي هتسرق منه';
    box.appendChild(h);
    var list = document.createElement('div');
    list.className = 'phase-targets';
    var targets = snap.players.filter(function (p) {
      return p.id !== state.myId && !p.eliminated && !p.invisible;
    });
    if (!targets.length) {
      var none = document.createElement('div');
      none.className = 'sub';
      none.textContent = 'مفيش خصم متاح';
      list.appendChild(none);
    }
    targets.forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'btn btn-outline';
      b.textContent = p.name + ' (' + (p.handCount || '؟') + ' كارت)';
      b.addEventListener('click', function () {
        Audio.click();
        if (state.handlers.onLoki) state.handlers.onLoki(p.id);
      });
      list.appendChild(b);
    });
    box.appendChild(list);
    var back = document.createElement('button');
    back.className = 'btn btn-outline';
    back.textContent = 'رجوع';
    back.addEventListener('click', function () { Audio.click(); hidePhaseOverlay(); showPhaseOverlay(snap); });
    box.appendChild(back);
    ov.appendChild(box);
  }

  function showHelaTargets(snap, box, ov) {
    box.innerHTML = '';
    var h = document.createElement('h3');
    h.textContent = 'اختار الخصم اللي هتلغي كارت من عنده';
    box.appendChild(h);
    var list = document.createElement('div');
    list.className = 'phase-targets';
    var targets = snap.players.filter(function (p) {
      return p.id !== state.myId && !p.eliminated && !p.invisible;
    });
    if (!targets.length) {
      var none = document.createElement('div');
      none.className = 'sub';
      none.textContent = 'مفيش خصم متاح';
      list.appendChild(none);
    }
    targets.forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'btn btn-outline';
      b.textContent = p.name + ' (' + (p.handCount || '؟') + ' كارت)';
      b.addEventListener('click', function () {
        Audio.click();
        if (state.handlers.onHela) state.handlers.onHela(p.id);
      });
      list.appendChild(b);
    });
    box.appendChild(list);
    var back = document.createElement('button');
    back.className = 'btn btn-outline';
    back.textContent = 'رجوع';
    back.addEventListener('click', function () { Audio.click(); hidePhaseOverlay(); showPhaseOverlay(snap); });
    box.appendChild(back);
    ov.appendChild(box);
  }

  function showKilgraveTargets(snap, box, ov) {
    box.innerHTML = '';
    var h = document.createElement('h3');
    h.textContent = 'اختار الخصم اللي هتتحكم فيه';
    box.appendChild(h);
    var list = document.createElement('div');
    list.className = 'phase-targets';
    var targets = snap.players.filter(function (p) {
      return p.id !== state.myId && !p.eliminated && !p.invisible;
    });
    if (!targets.length) {
      var none = document.createElement('div');
      none.className = 'sub';
      none.textContent = 'مفيش خصم متاح';
      list.appendChild(none);
    }
    targets.forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'btn btn-outline';
      b.textContent = p.name + ' (' + (p.handCount || '؟') + ' كارت)';
      b.addEventListener('click', function () {
        Audio.click();
        if (state.handlers.onKilgrave) state.handlers.onKilgrave(p.id);
      });
      list.appendChild(b);
    });
    box.appendChild(list);
    var back = document.createElement('button');
    back.className = 'btn btn-outline';
    back.textContent = 'رجوع';
    back.addEventListener('click', function () { Audio.click(); hidePhaseOverlay(); showPhaseOverlay(snap); });
    box.appendChild(back);
    ov.appendChild(box);
  }

  function showMrFreezeTargets(snap, box, ov) {
    box.innerHTML = '';
    var h = document.createElement('h3');
    h.textContent = 'اختار الخصم اللي هتجمدله كارت';
    box.appendChild(h);
    var list = document.createElement('div');
    list.className = 'phase-targets';
    var targets = snap.players.filter(function (p) {
      return p.id !== state.myId && !p.eliminated && !p.invisible;
    });
    if (!targets.length) {
      var none = document.createElement('div');
      none.className = 'sub';
      none.textContent = 'مفيش خصم متاح';
      list.appendChild(none);
    }
    targets.forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'btn btn-outline';
      b.textContent = p.name + ' (' + (p.handCount || '؟') + ' كارت)';
      b.addEventListener('click', function () {
        Audio.click();
        if (state.handlers.onMrFreeze) state.handlers.onMrFreeze(p.id);
      });
      list.appendChild(b);
    });
    box.appendChild(list);
    var back = document.createElement('button');
    back.className = 'btn btn-outline';
    back.textContent = 'رجوع';
    back.addEventListener('click', function () { Audio.click(); hidePhaseOverlay(); showPhaseOverlay(snap); });
    box.appendChild(back);
    ov.appendChild(box);
  }

  // Face-down cards so the user picks blindly (no info leak).
  function makeBlindCardEl() {
    var el = document.createElement('div');
    el.className = 'card blind';
    var inner = document.createElement('div');
    inner.className = 'inner';
    var back = document.createElement('div');
    back.className = 'face face-back';
    var emblem = document.createElement('div');
    emblem.className = 'emblem';
    var ring = document.createElement('div');
    ring.className = 'ring';
    emblem.appendChild(ring);
    back.appendChild(emblem);
    inner.appendChild(back);
    el.appendChild(inner);
    return el;
  }

  function showBlindPicker(snap, targetId, targetName, cardIds, title, pickFn) {
    var ov = q('phase-overlay');
    ov.classList.remove('hidden');
    ov.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'phase-box';
    var h = document.createElement('h3');
    h.textContent = title + ' ' + (targetName || 'الخصم');
    box.appendChild(h);
    var list = document.createElement('div');
    list.className = 'swap-hand';
    if (cardIds && cardIds.length) {
      cardIds.forEach(function (id) {
        var el = makeBlindCardEl();
        el.addEventListener('click', function () {
          Audio.select();
          pickFn(targetId, id);
        });
        list.appendChild(el);
      });
    } else {
      var none = document.createElement('div');
      none.className = 'sub';
      none.textContent = 'الخصم مفيش معاه كروت شخصية';
      list.appendChild(none);
    }
    box.appendChild(list);
    var back = document.createElement('button');
    back.className = 'btn btn-outline';
    back.textContent = 'رجوع';
    back.addEventListener('click', function () { Audio.click(); hidePhaseOverlay(); showPhaseOverlay(snap); });
    box.appendChild(back);
    ov.appendChild(box);
  }

  function showKilgraveBlind(snap, targetId, targetName, cardIds) {
    showBlindPicker(snap, targetId, targetName, cardIds, 'اختار كارت من غير ما تشوفه (هيتجبر يلعبه)', function (tid, id) {
      if (state.handlers.onKilgravePick) state.handlers.onKilgravePick(tid, id);
    });
  }

  function showMrFreezeBlind(snap, targetId, targetName, cardIds) {
    showBlindPicker(snap, targetId, targetName, cardIds, 'اختار كارت هيتجمد لمدة جولتين (من غير ما تشوفه)', function (tid, id) {
      if (state.handlers.onMrFreezePick) state.handlers.onMrFreezePick(tid, id);
    });
  }

  // Riddler peek: shows one card from every opponent (full card info), only to the user.
  function showRiddlerPeek(peeks) {
    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.id = 'riddler-overlay';
    var box = document.createElement('div');
    box.className = 'phase-box';
    var h = document.createElement('h2');
    h.textContent = 'Riddler كشف';
    box.appendChild(h);
    var sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = 'كارت من كل لاعب — ركز وذاكرهم';
    box.appendChild(sub);
    if (peeks && peeks.length) {
      peeks.forEach(function (pk) {
        var row = document.createElement('div');
        row.className = 'riddler-peek';
        var nm = document.createElement('div');
        nm.className = 'name';
        nm.textContent = pk.name;
        row.appendChild(nm);
        var el = makeCardEl(pk.card, false, null);
        el.classList.remove('enter');
        el.style.opacity = '1';
        el.style.margin = '0';
        var pkW = androidMode() ? '122px' : '150px';
        var pkH = androidMode() ? '178px' : '210px';
        el.style.width = pkW;
        el.style.height = pkH;
        row.appendChild(el);
        box.appendChild(row);
      });
    } else {
      var none = document.createElement('div');
      none.className = 'sub';
      none.textContent = 'مفيش كروت عند الخصوم';
      box.appendChild(none);
    }
    var ctn = document.createElement('button');
    ctn.className = 'btn btn-primary';
    ctn.textContent = 'فهمت';
    ctn.addEventListener('click', function () {
      Audio.click();
      ov.remove();
    });
    box.appendChild(ctn);
    ov.appendChild(box);
    document.body.appendChild(ov);
  }

  function showSaveUI(snap, box, ov) {
    box.innerHTML = '';
    var me = meIn(snap);
    var myPlay = null;
    if (snap.revealInfo) {
      for (var j = 0; j < snap.revealInfo.plays.length; j++) {
        if (snap.revealInfo.plays[j].playerId === state.myId) { myPlay = snap.revealInfo.plays[j]; break; }
      }
    }
    var sel = { played: null, hand: null };

    var h = document.createElement('h3');
    h.textContent = 'اختار الكارت اللي هتنقذه (من راوندك)';
    box.appendChild(h);

    var playedRow = document.createElement('div');
    playedRow.className = 'swap-hand';
    if (myPlay && myPlay.cards.length) {
      myPlay.cards.forEach(function (c) {
        var el = makeCardEl(c, true, snap.roundType);
        el.classList.remove('enter');
        el.style.opacity = '1';
        el.addEventListener('click', function () {
          sel.played = c.id;
          playedRow.querySelectorAll('.card').forEach(function (x) { x.classList.remove('selected'); });
          el.classList.add('selected');
          Audio.select();
          updateConfirm();
        });
        playedRow.appendChild(el);
      });
    } else {
      var n = document.createElement('div');
      n.className = 'sub';
      n.textContent = 'ما عندك كروت لعبتها في الراوند';
      playedRow.appendChild(n);
    }
    box.appendChild(playedRow);

    var sub2 = document.createElement('div');
    sub2.className = 'sub';
    sub2.textContent = 'اختار كارت شخصية من ايدك ترميها بداله';
    box.appendChild(sub2);

    var handRow = document.createElement('div');
    handRow.className = 'swap-hand';
    var chars = (me && me.hand ? me.hand : []).filter(function (c) { return !c.bonus && !c.special; });
    if (chars.length) {
      chars.forEach(function (c) {
        var el = makeCardEl(c, true, snap.roundType);
        el.classList.remove('enter');
        el.style.opacity = '1';
        el.addEventListener('click', function () {
          sel.hand = c.id;
          handRow.querySelectorAll('.card').forEach(function (x) { x.classList.remove('selected'); });
          el.classList.add('selected');
          Audio.select();
          updateConfirm();
        });
        handRow.appendChild(el);
      });
    } else {
      var n2 = document.createElement('div');
      n2.className = 'sub';
      n2.textContent = 'مفيش كارت شخصية في ايدك ترميها';
      handRow.appendChild(n2);
    }
    box.appendChild(handRow);

    var actions = document.createElement('div');
    actions.className = 'phase-actions';
    var confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.textContent = 'أنقذ';
    confirmBtn.disabled = true;
    function updateConfirm() { confirmBtn.disabled = !(sel.played && sel.hand); }
    confirmBtn.addEventListener('click', function () {
      Audio.click();
      if (state.handlers.onSave) state.handlers.onSave(sel.played, sel.hand);
    });
    actions.appendChild(confirmBtn);
    var back = document.createElement('button');
    back.className = 'btn btn-outline';
    back.textContent = 'رجوع';
    back.addEventListener('click', function () { Audio.click(); hidePhaseOverlay(); showPhaseOverlay(snap); });
    actions.appendChild(back);
    box.appendChild(actions);
    ov.appendChild(box);
  }

  function hidePhaseOverlay() {
    q('phase-overlay').classList.add('hidden');
  }

  /* ===== end overlay ===== */
  function showEnd(snap) {
    var ov = q('end-overlay');
    ov.classList.remove('hidden');
    hideReveal();
    hideSwap();
    ov.innerHTML = '';
    var h = document.createElement('h2');
    if (snap.winnerIds.length === 1) {
      h.innerHTML = 'فاز <span style="color:#fff">' + esc(playerName(snap, snap.winnerIds[0])) + '</span> باللعبة!';
    } else {
      h.textContent = 'فوز مشترك!';
    }
    ov.appendChild(h);

    var list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:min(420px,90vw);';
    snap.players.slice().sort(function (a, b) { return b.points - a.points; }).forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'reveal-row';
      var win = snap.winnerIds.indexOf(p.id) >= 0;
      if (win) row.classList.add('winner');
      if (p.eliminated) row.classList.add('eliminated');
      row.innerHTML =
        '<div class="name">' + esc(p.name) + '</div>' +
        '<div class="total">' + p.points + '</div>' +
        '<div class="badge ' + (win ? 'win' : (p.eliminated ? 'out' : 'lose')) + '">' + (win ? 'فايز' : (p.eliminated ? 'خرج' : '')) + '</div>';
      list.appendChild(row);
    });
    ov.appendChild(list);

    var rowBtns = document.createElement('div');
    rowBtns.style.cssText = 'display:flex;gap:12px;';
    if (state.handlers.onRestart) {
      var again = document.createElement('button');
      again.className = 'btn btn-primary';
      again.textContent = 'العب تاني';
      again.addEventListener('click', function () { Audio.click(); ov.classList.add('hidden'); state.endShown = false; if (state.handlers.onRestart) state.handlers.onRestart(); });
      rowBtns.appendChild(again);
    }
    var menu = document.createElement('button');
    menu.className = 'btn btn-outline';
    menu.textContent = 'القائمة الرئيسية';
    menu.addEventListener('click', function () { Audio.click(); ov.classList.add('hidden'); state.endShown = false; if (state.handlers.onMenu) state.handlers.onMenu(); });
    rowBtns.appendChild(menu);
    ov.appendChild(rowBtns);

    Audio.win();
  }

  function hideEnd() { q('end-overlay').classList.add('hidden'); state.endShown = false; }

  function renderSpectate(snap) {
    var banner = q('spectate-banner');
    if (!banner) return;
    var me = null;
    for (var i = 0; i < snap.players.length; i++) if (snap.players[i].id === state.myId) me = snap.players[i];
    var show = me && me.eliminated && snap.phase !== 'ended';
    banner.classList.toggle('hidden', !show);
  }

  /* ===== main render ===== */
  function renderGame(snap, opts) {
    opts = opts || {};
    if (opts.myId) state.myId = opts.myId;
    if (opts.isAiMode != null) state.isAiMode = opts.isAiMode;
    if (!state.dragged) {
      makeDraggable(q('battle-area'));
      makeDraggable(q('type-picker'));
      state.dragged = true;
    }
    if (opts.onType) state.handlers.onType = opts.onType;
    if (opts.onPlay) state.handlers.onPlay = opts.onPlay;
    if (opts.onContinue) state.handlers.onContinue = opts.onContinue;
    if (opts.onSwap) state.handlers.onSwap = opts.onSwap;
    if (opts.onLoki) state.handlers.onLoki = opts.onLoki;
    if (opts.onTwoFace) state.handlers.onTwoFace = opts.onTwoFace;
    if (opts.onHela) state.handlers.onHela = opts.onHela;
    if (opts.onKilgrave) state.handlers.onKilgrave = opts.onKilgrave;
    if (opts.onKilgravePick) state.handlers.onKilgravePick = opts.onKilgravePick;
    if (opts.onMrFreeze) state.handlers.onMrFreeze = opts.onMrFreeze;
    if (opts.onMrFreezePick) state.handlers.onMrFreezePick = opts.onMrFreezePick;
    if (opts.onTranslucent) state.handlers.onTranslucent = opts.onTranslucent;
    if (opts.onRiddler) state.handlers.onRiddler = opts.onRiddler;
    if (opts.onSave) state.handlers.onSave = opts.onSave;
    if (opts.onSkip) state.handlers.onSkip = opts.onSkip;
    if (opts.onRestart) state.handlers.onRestart = opts.onRestart;
    if (opts.onMenu) state.handlers.onMenu = opts.onMenu;

    var prevPhase = state.lastPhase;
    var prevRound = state.lastRound;
    state.snap = snap;
    state.lastPhase = snap.phase;
    state.lastRound = snap.round;

    // just finalized this round: reveal from playing/swap into revealed/ended
    var justFinalized = (snap.phase === 'revealed' || snap.phase === 'ended') && snap.revealInfo &&
      (prevPhase === 'playing' || prevPhase === 'swap') && snap.round === prevRound;
    if (justFinalized && state.shownRevealRound !== snap.round) {
      state.shownRevealRound = snap.round;
      showReveal(snap.revealInfo);
    } else if (!justFinalized) {
      hideReveal();
    }
    // phase overlays: pre-round (Loki) and post-round (Reverse Flash)
    if (snap.phase === 'preRound' || snap.phase === 'postRound') {
      showPhaseOverlay(snap);
    } else {
      hidePhaseOverlay();
    }

    // new round sound
    if (snap.round !== prevRound && prevRound !== 0 && snap.phase === 'chooseType') {
      Audio.draw();
    }

    if (prevPhase !== snap.phase) closeCardPreview();

    placeSeats(snap);
    renderTop(snap);
    renderTypePicker(snap);
    renderActionBar(snap);
    renderSpectate(snap);

    // if I take over 10s to pick my cards, opponents keep telling me to hurry
    if (snap.phase === 'playing' && snap.currentPlayerId !== state.lastTurnPlayerId) {
      state.lastTurnPlayerId = snap.currentPlayerId;
      if (snap.currentPlayerId === state.myId && !isEliminated(snap, state.myId)) {
        scheduleHurry();
      }
    }
    if (!(snap.phase === 'playing' && snap.currentPlayerId === state.myId)) {
      clearTimeout(hurryTimer);
      hurryTimer = null;
    }

    var me = null;
    for (var i = 0; i < snap.players.length; i++) if (snap.players[i].id === state.myId) me = snap.players[i];
    if (me) {
      var canSelect = !me.eliminated && (snap.phase === 'chooseType' || snap.phase === 'playing');
      state.myPlayable = me.hand || [];
      state.trayActive = androidMode() && canSelect;
      buildHand(me.hand || [], canSelect, snap.roundType);
    } else {
      state.myPlayable = [];
      state.trayActive = false;
      clearHand();
    }
    fitHand();
    renderPlayPill();
    renderMyBadge(snap);

    // end overlay: when ended with no reveal shown (elimination edge) OR after reveal dismissed
    if (snap.phase === 'ended' && !state.endShown && !justFinalized) {
      showEnd(snap);
    }
  }

  return {
    startBackground: startBackground,
    showScreen: showScreen,
    toast: toast,
    showReaction: showReaction,
    reaction: reaction,
    showChatPop: showChatPop,
    stealReaction: stealReaction,
    setStatus: setStatus,
    setOnline: function (v) { state.online = !!v; },
    renderRulesHint: renderRulesHint,
    renderGame: renderGame,
    selectedIds: selectedIds,
    clearHand: clearHand,
    updatePlayBtn: updatePlayBtn,
    hideReveal: hideReveal,
    hideSwap: hideSwap,
    hidePhaseOverlay: hidePhaseOverlay,
    hideEnd: hideEnd,
    showKilgravePicker: function (snap, targetId, targetName, cardIds) {
      showKilgraveBlind(snap, targetId, targetName, cardIds);
    },
    showMrFreezePicker: function (snap, targetId, targetName, cardIds) {
      showMrFreezeBlind(snap, targetId, targetName, cardIds);
    },
    showRiddlerPeek: showRiddlerPeek,
    renderSpectate: renderSpectate
  };
});
