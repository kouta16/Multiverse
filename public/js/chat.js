/* Multiverse room chat — text + emoji grid + voice memes tab. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Chat = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Voice memes list — add { id, name } entries here later (files under public/audio/).
  var MEME_SOUNDS = [];

  var EMOJI_GROUPS = [
    {
      label: 'وجوه',
      list: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😍','🥰','😘','😗','😙','😚','😋','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','😇','🥳','🥺','😢','😭','😱','😖','😣','😞','😓','😩','😫','😤','😡','😠','🤬','😈','💀','☠️','👻','👽','🤖','💩','😺','😸','😹','😻','😼','😽','🙀','😿','😾']
    },
    {
      label: 'إيدين وإشارات',
      list: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦵','🦶','👂','👃','👀','🧠','🦷','👅','👄']
    },
    {
      label: 'قلوب ورموز',
      list: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','💯','💢','💥','💫','💦','💨','🔥','✨','⭐','⚡','☄️','🌊','🌈','🎵','🎶','💲','💸','💰','💎','💣','🎉','🎊','🎁','🎈','🎀','🪄','🔮','🗿','🎃','👑']
    },
    {
      label: 'كل حاجة',
      list: ['🚀','🌍','⚽','🏀','🎮','🍕','🍔','🍟','🌭','🍿','🧁','🍩','🍫','☕','🥤','🍺','🍻','🥂','🌶️','😎','🤓','🥶','🥵','🤯','😳','😵','🤠','🤡','🎤','🎸','🥁','🎧','📱','⌚','💻','🎮','🏆','🥇','🥈','🥉','⚔️','🛡️','💥','🌙','☀️','❄️','💧','🔥','🌪️','🌈']
    }
  ];

  var myId = null;
  var enabled = false;
  var online = false;
  var open = false;
  var messages = [];
  var unread = 0;
  var built = false;

  function q(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ensureBuilt() {
    if (built) return;
    built = true;

    q('chat-btn').addEventListener('click', toggle);
    q('chat-close').addEventListener('click', function () { setOpen(false); });
    q('chat-send').addEventListener('click', sendText);
    q('chat-emoji-btn').addEventListener('click', function () {
      Audio.click();
      var g = q('chat-emoji-grid');
      g.classList.toggle('hidden', !g.classList.contains('hidden'));
    });
    var inp = q('chat-input');
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); sendText(); }
    });

    var tabs = document.querySelectorAll('.chat-tab');
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        Audio.click();
        tabs.forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        var isMemes = t.dataset.ctab === 'memes';
        q('chat-talk').classList.toggle('hidden', isMemes);
        q('chat-memes').classList.toggle('hidden', !isMemes);
        if (isMemes) renderMemes();
      });
    });

    var grid = q('chat-emoji-grid');
    EMOJI_GROUPS.forEach(function (g) {
      var h = document.createElement('div');
      h.className = 'chat-emoji-cat';
      h.textContent = g.label;
      grid.appendChild(h);
      var row = document.createElement('div');
      row.className = 'chat-emoji-row';
      g.list.forEach(function (em) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'chat-emoji';
        b.textContent = em;
        b.addEventListener('click', function () { Audio.click(); sendEmoji(em); });
        row.appendChild(b);
      });
      grid.appendChild(row);
    });
  }

  function setMyId(id) { myId = id; rerender(); }

  function setOnline(v) { online = !!v; }

  function enable() {
    enabled = true;
    unread = 0;
    ensureBuilt();
    q('chat-btn').classList.remove('hidden');
    updateBadge();
  }

  function disable() {
    enabled = false;
    setOpen(false);
    var b = q('chat-btn');
    if (b) b.classList.add('hidden');
  }

  function reset() {
    messages = [];
    unread = 0;
    var box = q('chat-msgs');
    if (box) box.innerHTML = '';
    updateBadge();
  }

  function toggle() { setOpen(!open); }

  function setOpen(v) {
    ensureBuilt();
    open = v;
    q('chat-panel').classList.toggle('hidden', !v);
    var b = q('chat-btn');
    if (v) {
      b.classList.add('open');
      unread = 0;
      updateBadge();
      var inp = q('chat-input');
      if (inp) inp.focus();
    } else {
      b.classList.remove('open');
    }
  }

  function updateBadge() {
    var bd = q('chat-badge');
    if (!bd) return;
    if (unread > 0) {
      bd.textContent = unread > 99 ? '99+' : unread;
      bd.classList.remove('hidden');
    } else {
      bd.classList.add('hidden');
    }
  }

  function handle(m) {
    if (m.kind === 'sound' && m.sound && m.from === myId && !m.played) m.played = true;
    messages.push(m);
    if (messages.length > 200) messages.shift();
    if (!open && m.from !== myId) unread++;
    appendOne(m);
    updateBadge();
    if (typeof Render !== 'undefined' && Render.showChatPop) {
      Render.showChatPop(m);
    }
  }

  function handleHistory(list) {
    messages = (list || []).slice(-100);
    rerender();
  }

  function appendOne(m) {
    var box = q('chat-msgs');
    if (!box) return;
    box.appendChild(buildMsg(m));
    box.scrollTop = box.scrollHeight;
  }

  function rerender() {
    var box = q('chat-msgs');
    if (!box) return;
    box.innerHTML = '';
    messages.forEach(function (m) { appendOne(m); });
  }

  function buildMsg(m) {
    var mine = m.from === myId;
    var el = document.createElement('div');
    el.className = 'chat-msg' + (mine ? ' me' : '');
    var name = document.createElement('div');
    name.className = 'chat-msg-name';
    name.textContent = mine ? 'أنت' : (m.name || 'لاعب');
    var bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    if (m.kind === 'emoji' && m.emoji) {
      bubble.classList.add('emoji');
      bubble.textContent = m.emoji;
    } else if (m.kind === 'sound' && m.sound) {
      bubble.classList.add('sound');
      bubble.innerHTML = '<span class="snd-ic">🔊</span>' + esc(m.soundName || m.sound);
      if (!m.played && typeof Audio.playMeme === 'function') Audio.playMeme(m.sound);
    } else {
      bubble.textContent = (m.emoji ? m.emoji + ' ' : '') + (m.text || '');
    }
    el.appendChild(name);
    el.appendChild(bubble);
    return el;
  }

  function sendText() {
    var inp = q('chat-input');
    var v = inp.value.trim();
    if (!v) return;
    var text = v.slice(0, 300);
    if (online) Net.send({ t: 'chat', kind: 'text', text: text });
    else handle({ from: myId, kind: 'text', text: text });
    inp.value = '';
    Audio.click();
  }

  function sendEmoji(em) {
    if (online) Net.send({ t: 'chat', kind: 'emoji', emoji: em });
    else handle({ from: myId, kind: 'emoji', emoji: em });
    Audio.click();
  }

  function renderMemes() {
    var box = q('chat-memes');
    if (!box) return;
    box.innerHTML = '';
    var sounds = (typeof Audio.memeList === 'function') ? Audio.memeList() : MEME_SOUNDS;
    if (!sounds.length) {
      var ph = document.createElement('div');
      ph.className = 'chat-meme-placeholder';
      ph.innerHTML = '<div class="cm-ic">🎵</div><div>الميمز هتتضاف هنا قريبًا</div>';
      box.appendChild(ph);
      return;
    }
    var grid = document.createElement('div');
    grid.className = 'chat-meme-grid';
    sounds.forEach(function (mm) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat-meme-btn';
      b.textContent = mm.name;
      b.title = mm.name;
      b.addEventListener('click', function () {
        Audio.click();
        if (typeof Audio.playMeme === 'function') Audio.playMeme(mm.id);
        if (online) Net.send({ t: 'chat', kind: 'sound', sound: mm.id, soundName: mm.name });
        else handle({ from: myId, kind: 'sound', sound: mm.id, soundName: mm.name, played: true });
      });
      grid.appendChild(b);
    });
    box.appendChild(grid);
    var count = document.createElement('div');
    count.className = 'chat-meme-count';
    count.textContent = 'عدد الأصوات: ' + sounds.length;
    box.appendChild(count);
  }

  return {
    setMyId: setMyId,
    setOnline: setOnline,
    enable: enable,
    disable: disable,
    reset: reset,
    handle: handle,
    handleHistory: handleHistory
  };
});