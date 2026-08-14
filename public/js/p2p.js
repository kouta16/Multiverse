/* Multiverse direct (peer-to-peer) transport + embedded host controller.

   The host client runs the whole room locally (no WebSocket server needed):
   guests attach over WebRTC through PeerJS's free cloud broker using a 6-char
   invite code. The code on this file mirrors server/index.js exactly for the
   host so the game behaves identically with or without a server. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.P2P = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var CODE_LEN = 6;
  var MAX_PLAYERS = 4;
  var PHASE_MS = 30000;
  var CONTINUE_MS = 12000;
  var CONNECT_TIMEOUT = 15000;

  var mode = null;       // 'host' | 'join'
  var peer = null;
  var myConn = null;     // join side: the DataConnection to the host
  var peerOpen = false;
  var connOpen = false;
  var handlers = {};
  var queue = [];
  var closed = false;
  var connectTimer = null;

  // ---------- host controller state ----------
  var hostChannels = [];  // Array of channels; [0] is always the host client
  var hostIds = {};       // id -> channel
  var hostId = null;      // channel 0 id
  var meId = null;        // == hostId (local client running the controller)
  var roomCode = null;
  var roomStarted = false;
  var game = null;
  var roomChat = [];
  var noTimer = null;     // 12s continue/swap timer
  var phaseTimer = null;  // 30s phase timer
  var pending = new Map(); // DataConnection (guest) -> true (awaiting its 'join')

  /* ---------- helpers ---------- */
  function genId() { return 'p' + Math.random().toString(36).slice(2, 8); }
  function makeCode() {
    var s = '';
    for (var i = 0; i < CODE_LEN; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }
  function codeToPeer(c) { return 'mv-' + c; }
  function cleanName(n) { n = String(n || '').trim().slice(0, 16); return n || 'لاعب'; }
  function connSend(conn, o) {
    if (!conn || !conn.open) return;
    try { conn.send(o); } catch (e) {}
  }

  function parseMsg(raw) {
    if (raw && typeof raw === 'object') {
      if (raw.t) return raw;                 // already parsed (serialization json)
      if (typeof raw.byteLength === 'number') { /* ArrayBuffer like */ }
      else return raw;
    }
    var str = typeof raw === 'string' ? raw : null;
    if (str === null && raw && typeof raw.byteLength === 'number') {
      try { str = new TextDecoder().decode(new Uint8Array(raw)); } catch (e) {}
    }
    if (str === null) return null;
    try { return JSON.parse(str); } catch (e) { return null; }
  }

  function clearTimers() {
    if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
    if (noTimer) { clearTimeout(noTimer); noTimer = null; }
    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
  }

  /* ---------- channel model ---------- */
  // 'host' channel loops back into this client's message handlers; 'conn'
  // wraps a guest DataConnection.
  function makeChannel(kind, data) {
    var ch = {
      id: null,
      name: data.name || 'لاعب',
      avatar: data.avatar || '',
      kind: kind,
      open: true
    };
    if (kind === 'host') {
      ch.send = function (o) { Net.route(o, handlers); };
    } else {
      ch.conn = data.conn;
      ch.send = function (o) {
        if (ch.conn && ch.conn.open) {
          try { ch.conn.send(o); } catch (e) {}
        }
      };
    }
    return ch;
  }
  function channelById(id) { return hostIds[id] || null; }
  function channelByConn(conn) {
    for (var i = 0; i < hostChannels.length; i++) if (hostChannels[i].kind === 'conn' && hostChannels[i].conn === conn) return hostChannels[i];
    return null;
  }

  function hostPlayerList() {
    return hostChannels.map(function (ch) {
      return { id: ch.id, name: ch.name, host: ch.id === hostId, connected: ch.open, avatar: ch.avatar };
    });
  }

  function hostBroadcast() {
    for (var i = 0; i < hostChannels.length; i++) {
      var ch = hostChannels[i];
      if (!ch.open) continue;
      ch.send({
        t: 'state',
        code: roomCode,
        hostId: hostId,
        started: roomStarted,
        you: ch.id,
        players: hostPlayerList(),
        snapshot: game ? Multiverse.snapshot(game, ch.id) : null
      });
    }
  }

  /* ---------- host controller (port of server/index.js handleMessage) ---------- */
  function scheduleContinue() {
    if (noTimer) clearTimeout(noTimer);
    noTimer = setTimeout(function () {
      noTimer = null;
      if (closed || !game) return;
      if (game.phase === 'revealed') {
        Multiverse.continueAfterReveal(game);
        hostBroadcast();
      } else if (game.phase === 'swap') {
        Multiverse.resolveSwap(game, game.swapPlayerId, null);
        hostBroadcast();
      }
    }, CONTINUE_MS);
  }

  function schedulePhaseTimer() {
    if (phaseTimer) clearTimeout(phaseTimer);
    phaseTimer = setTimeout(function () {
      if (closed || !game) return;
      Multiverse.skipPhaseTurn(game, game.phaseTurnId);
      hostBroadcast();
      schedulePhaseTimer();
    }, PHASE_MS);
  }

  function handleToken(msg, pid) {
    var ch = channelById(pid);
    if (!ch) return;
    var i, p, ev, target, by, res;
    switch (msg.t) {
      case 'auth':
        break; // no accounts in direct mode
      case 'leave':
        break; // the client handles going back to the menu itself
      case 'create':
      case 'join':
        break; // handled by the transport layer
      case 'start': {
        if (roomStarted || pid !== hostId) return;
        var connected = hostChannels.filter(function (c) { return c.open; });
        if (connected.length < 2) {
          ch.send({ t: 'error', msg: 'تحتاج لاعبين على الأقل' });
          return;
        }
        game = Multiverse.createGame({
          players: connected.map(function (c) { return { id: c.id, name: c.name, isAI: false, avatar: c.avatar }; }),
          cards: CARD_POOL
        });
        roomStarted = true;
        game.turnDeadline = Date.now() + PHASE_MS;
        schedulePhaseTimer();
        hostBroadcast();
        break;
      }
      case 'chooseType': {
        if (!game) return;
        res = Multiverse.chooseRoundType(game, pid, msg.stat);
        if (res && res.error) return ch.send({ t: 'error', msg: res.error });
        hostBroadcast();
        break;
      }
      case 'play': {
        if (!game) return;
        res = Multiverse.playCards(game, pid, msg.cards || msg.cardIds);
        if (res && res.error) return ch.send({ t: 'error', msg: res.error });
        if (game.phase === 'revealed' || game.phase === 'ended') scheduleContinue();
        hostBroadcast();
        break;
      }
      case 'continue': {
        if (!game) return;
        if (noTimer) { clearTimeout(noTimer); noTimer = null; }
        res = Multiverse.continueAfterReveal(game);
        if (res && res.error) return ch.send({ t: 'error', msg: res.error });
        game.turnDeadline = Date.now() + PHASE_MS;
        schedulePhaseTimer();
        hostBroadcast();
        break;
      }
      case 'swap': {
        if (!game) return;
        res = Multiverse.resolveSwap(game, pid, msg.handCardId || null);
        if (res && res.error) return ch.send({ t: 'error', msg: res.error });
        for (i = 0; i < hostChannels.length; i++) {
          if (hostChannels[i].open) hostChannels[i].send({ t: 'swapEvt', by: pid });
        }
        hostBroadcast();
        break;
      }
      case 'useLoki': {
        if (!game) return;
        res = Multiverse.useLoki(game, pid, msg.targetId);
        if (res && res.error) return ch.send({ t: 'error', msg: res.error });
        target = game.players.find(function (p) { return p.id === msg.targetId; });
        for (i = 0; i < hostChannels.length; i++) {
          if (!hostChannels[i].open) continue;
          ev = { t: 'steal', by: pid, target: msg.targetId };
          if (hostChannels[i].id === pid) {
            ev.stolenName = res.stolenName;
            ev.targetName = target ? target.name : '؟';
          }
          hostChannels[i].send(ev);
        }
        hostBroadcast();
        break;
      }
      case 'twoFace': {
        if (!game) return;
        res = Multiverse.useTwoFace(game, pid);
        if (res && res.error) return ch.send({ t: 'error', msg: res.error });
        if (res.ok) ch.send({ t: 'twoFaceEvt', drawn: res.drawn });
        hostBroadcast();
        break;
      }
      case 'hela': {
        if (!game) return;
        res = Multiverse.useHela(game, pid, msg.targetId);
        if (res && res.error) return ch.send({ t: 'error', msg: res.error });
        target = game.players.find(function (p) { return p.id === msg.targetId; });
        for (i = 0; i < hostChannels.length; i++) {
          if (!hostChannels[i].open) continue;
          ev = { t: 'helaEvt', by: pid, target: msg.targetId };
          if (hostChannels[i].id === pid) {
            ev.discardedName = res.discardedName;
            ev.targetName = target ? target.name : '؟';
          }
          hostChannels[i].send(ev);
        }
        hostBroadcast();
        break;
      }
      case 'kilgraveTarget': {
        if (!game) return;
        var opts = Multiverse.kilgraveOptions(game, msg.targetId);
        if (opts && opts.error) return ch.send({ t: 'error', msg: opts.error });
        target = game.players.find(function (p) { return p.id === msg.targetId; });
        ch.send({ t: 'kilgraveTargets', targetId: msg.targetId, targetName: target ? target.name : '؟', cardIds: opts.cardIds });
        break;
      }
      case 'useKilgrave': {
        if (!game) return;
        res = Multiverse.useKilgrave(game, pid, msg.targetId, msg.cardId);
        if (res && res.error) return ch.send({ t: 'error', msg: res.error });
        by = game.players.find(function (p) { return p.id === pid; });
        target = game.players.find(function (p) { return p.id === msg.targetId; });
        for (i = 0; i < hostChannels.length; i++) {
          if (!hostChannels[i].open) continue;
          hostChannels[i].send({
            t: 'kilgraveEvt',
            by: pid,
            byName: by ? by.name : '؟',
            target: msg.targetId,
            targetName: target ? target.name : '؟'
          });
        }
        hostBroadcast();
        break;
      }
      case 'riddler': {
        if (!game) return;
        res = Multiverse.useRiddler(game, pid);
        if (res && res.error) return ch.send({ t: 'error', msg: res.error });
        by = game.players.find(function (p) { return p.id === pid; });
        for (i = 0; i < hostChannels.length; i++) {
          if (!hostChannels[i].open) continue;
          ev = { t: 'riddlerEvt', by: pid, byName: by ? by.name : '؟' };
          if (hostChannels[i].id === pid) ev.peeks = res.peeks;
          hostChannels[i].send(ev);
        }
        hostBroadcast();
        break;
      }
      case 'mrFreezeTarget': {
        if (!game) return;
        opts = Multiverse.kilgraveOptions(game, msg.targetId);
        if (opts && opts.error) return ch.send({ t: 'error', msg: opts.error });
        target = game.players.find(function (p) { return p.id === msg.targetId; });
        ch.send({ t: 'mrFreezeTargets', targetId: msg.targetId, targetName: target ? target.name : '؟', cardIds: opts.cardIds });
        break;
      }
      case 'useMrFreeze': {
        if (!game) return;
        res = Multiverse.useMrFreeze(game, pid, msg.targetId, msg.cardId);
        if (res && res.error) return ch.send({ t: 'error', msg: res.error });
        by = game.players.find(function (p) { return p.id === pid; });
        target = game.players.find(function (p) { return p.id === msg.targetId; });
        for (i = 0; i < hostChannels.length; i++) {
          if (!hostChannels[i].open) continue;
          hostChannels[i].send({
            t: 'mrFreezeEvt',
            by: pid,
            byName: by ? by.name : '؟',
            target: msg.targetId,
            targetName: target ? target.name : '؟'
          });
        }
        hostBroadcast();
        break;
      }
      case 'translucent': {
        if (!game) return;
        res = Multiverse.useTranslucent(game, pid);
        if (res && res.error) return ch.send({ t: 'error', msg: res.error });
        by = game.players.find(function (p) { return p.id === pid; });
        for (i = 0; i < hostChannels.length; i++) {
          if (!hostChannels[i].open) continue;
          hostChannels[i].send({ t: 'translucentEvt', by: pid, byName: by ? by.name : '؟' });
        }
        hostBroadcast();
        break;
      }
      case 'useReverseFlash': {
        if (!game) return;
        res = Multiverse.useReverseFlash(game, pid, msg.playedCardId, msg.handCardId);
        if (res && res.error) return ch.send({ t: 'error', msg: res.error });
        for (i = 0; i < hostChannels.length; i++) {
          if (hostChannels[i].open) hostChannels[i].send({ t: 'saveEvt', by: pid });
        }
        hostBroadcast();
        break;
      }
      case 'chat': {
        var kind = (msg.kind === 'emoji' || msg.kind === 'sound') ? msg.kind : 'text';
        var text = kind === 'text' ? String(msg.text || '').trim().slice(0, 300) : '';
        var emoji = kind === 'emoji' ? String(msg.emoji || '').trim().slice(0, 32) : '';
        var sound = kind === 'sound' ? String(msg.sound || '').trim().slice(0, 40) : '';
        var soundName = kind === 'sound' ? String(msg.soundName || '').trim().slice(0, 40) : '';
        if (!text && !emoji && !sound) return;
        var chatMsg = {
          t: 'chat',
          from: pid,
          name: ch.name,
          avatar: ch.avatar || '',
          kind: kind,
          text: text,
          emoji: emoji,
          sound: sound,
          soundName: soundName,
          ts: Date.now()
        };
        roomChat.push(chatMsg);
        if (roomChat.length > 100) roomChat.shift();
        for (i = 0; i < hostChannels.length; i++) {
          if (hostChannels[i].open) hostChannels[i].send(chatMsg);
        }
        break;
      }
      case 'skipPhase': {
        if (!game) return;
        res = Multiverse.skipPhaseTurn(game, pid);
        if (res && res.error) return ch.send({ t: 'error', msg: res.error });
        schedulePhaseTimer();
        hostBroadcast();
        break;
      }
    }
  }

  /* ---------- host-side guest lifecycle ---------- */
  function onPeerConnection(conn) {
    pending.set(conn, true);
    conn.on('data', function (raw) {
      var msg = parseMsg(raw);
      if (!msg) return;
      if (pending.has(conn)) {
        if (msg.t !== 'join') { try { conn.close(); } catch (e) {} return; } // must identify first
        pending.delete(conn);
        addGuest(conn, msg);
        return;
      }
      var ch = channelByConn(conn);
      if (!ch) return;
      try { handleToken(msg, ch.id); }
      catch (err) { console.error('[p2p] host error:', err); connSend(conn, { t: 'error', msg: 'خطأ داخلي' }); }
    });
    conn.on('close', function () {
      if (pending.has(conn)) pending.delete(conn);
      var ch = channelByConn(conn);
      if (ch) onGuestClose(ch);
    });
    conn.on('error', function () {});
  }

  function addGuest(conn, joinMsg) {
    if (roomStarted) {
      connSend(conn, { t: 'error', msg: 'اللعبة بدأت بالفعل' });
      try { conn.close(); } catch (e) {}
      return;
    }
    if (hostChannels.length >= MAX_PLAYERS) {
      connSend(conn, { t: 'error', msg: 'الروم ممتلئ (4 لاعبين)' });
      try { conn.close(); } catch (e) {}
      return;
    }
    var ch = makeChannel('conn', { conn: conn });
    ch.id = genId();
    ch.name = cleanName(joinMsg.name);
    ch.avatar = String(joinMsg.avatar || '');
    hostIds[ch.id] = ch;
    hostChannels.push(ch);
    connSend(conn, { t: 'chatHistory', messages: roomChat });
    hostBroadcast();
  }

  function onGuestClose(ch) {
    if (closed) return;
    if (!roomStarted) {
      delete hostIds[ch.id];
      var idx = hostChannels.indexOf(ch);
      if (idx > -1) hostChannels.splice(idx, 1);
      hostBroadcast();
    } else {
      ch.open = false;
      if (game) {
        if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
        schedulePhaseTimer();
      }
      hostBroadcast();
    }
  }

  /* ---------- host startup ---------- */
  var hostAttempts = 0;

  function startHost(name, avatar) {
    roomCode = makeCode();
    var hostCh = makeChannel('host', { name: name, avatar: avatar });
    hostCh.id = genId();
    hostId = hostCh.id;
    meId = hostCh.id;
    hostIds[hostCh.id] = hostCh;
    hostChannels.push(hostCh);

    peer = new Peer(codeToPeer(roomCode), { debug: 0 });
    armConnectTimeout();

    peer.on('open', function () {
      peerOpen = true;
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      hostBroadcast();
      if (handlers.onOpen) handlers.onOpen();
    });
    peer.on('connection', function (conn) {
      conn.serialization = 'json';
      onPeerConnection(conn);
    });
    peer.on('error', function (err) {
      if (err && err.type === 'unavailable-id') {
        if (hostAttempts < 3) {
          hostAttempts++;
          try { peer.destroy(); } catch (e) {}
          resetHostState();
          startHost(name, avatar);
          return;
        }
        if (handlers.onServerError) handlers.onServerError('الكود اتكسر — جرب تاني');
      } else if (!peerOpen) {
        if (handlers.onServerError) handlers.onServerError('مقدرش أوصل لخدمة الإشارة — راجع اتصالك بالنت');
      }
      fail();
    });
    peer.on('disconnected', function () {
      // body: the broker dropped but peer data connections keep working
    });
  }

  function resetHostState() {
    hostChannels = [];
    hostIds = {};
    roomChat = [];
    hostId = null;
    meId = null;
    roomCode = null;
    roomStarted = false;
    game = null;
    clearTimers();
  }

  function armConnectTimeout() {
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = setTimeout(function () {
      connectTimer = null;
      if (peerOpen || connOpen) return;
      if (handlers.onServerError) handlers.onServerError('وصلنا للحد الأقصى — تأكد إن نتك شغال وحاول تاني');
      fail();
    }, CONNECT_TIMEOUT);
  }

  function fail() {
    if (closed) return;
    clearTimers();
    try { if (myConn) myConn.close(); } catch (e) {}
    try { if (peer) peer.destroy(); } catch (e) {}
    myConn = null;
    peer = null;
    peerOpen = false;
    connOpen = false;
    if (handlers.onClose) handlers.onClose();
  }

  /* ---------- join side ---------- */
  function startJoin(code, name, avatar) {
    peer = new Peer({ debug: 0 });
    armConnectTimeout();
    peer.on('open', function () {
      peerOpen = true;
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      myConn = peer.connect(codeToPeer(code), { reliable: true, serialization: 'json' });
      if (!myConn) { fail(); return; }
      myConn.on('open', function () {
        connOpen = true;
        sendDirect({ t: 'join', name: name, avatar: avatar });
        for (var i = 0; i < queue.length; i++) sendDirect(queue[i]);
        queue = [];
        if (handlers.onOpen) handlers.onOpen();
      });
      myConn.on('data', function (raw) {
        var msg = parseMsg(raw);
        if (msg) Net.route(msg, handlers);
      });
      myConn.on('close', function () {
        if (closed) return;
        if (handlers.onClose) handlers.onClose();
      });
      myConn.on('error', function () {
        if (closed) return;
        if (handlers.onError) handlers.onError();
      });
    });
    peer.on('error', function (err) {
      if (closed) return;
      if (err && err.type === 'peer-unavailable') {
        if (handlers.onServerError) handlers.onServerError('الكود مش موجود أو المضيف خرج — أكد الكود');
      } else if (!peerOpen) {
        if (handlers.onServerError) handlers.onServerError('مقدرش أوصل لخدمة الإشارة — راجع اتصالك بالنت');
      }
      fail();
    });
    peer.on('disconnected', function () {});
  }

  function sendDirect(o) {
    if (!myConn || !myConn.open) return;
    try { myConn.send(o); } catch (e) {}
  }

  /* ---------- transport API (Net-compatible) ---------- */
  function connect(cfg, h) {
    handlers = h || {};
    queue = [];
    closed = false;
    clearTimers();
    cfg = cfg || {};

    if (typeof Peer === 'undefined') {
      if (handlers.onServerError) handlers.onServerError('مكتبة الاتصال المباشر مش محملة');
      if (handlers.onClose) handlers.onClose();
      return;
    }

    var name = cleanName(cfg.name);
    var avatar = String(cfg.avatar || '');

    if (cfg.mode === 'host') {
      mode = 'host';
      hostAttempts = 0;
      resetHostState();
      startHost(name, avatar);
    } else {
      mode = 'join';
      var code = String(cfg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
      if (code.length < CODE_LEN) {
        if (handlers.onServerError) handlers.onServerError('الكود لازم يبقى ' + CODE_LEN + ' حروف/أرقام');
        if (handlers.onClose) handlers.onClose();
        return;
      }
      startJoin(code, name, avatar);
    }
  }

  function send(o) {
    if (closed) return;
    if (mode === 'host') {
      var m = JSON.parse(JSON.stringify(o));
      try { handleToken(m, meId); }
      catch (err) { console.error('[p2p] host action error:', err); }
      return;
    }
    if (connOpen) sendDirect(o);
    else queue.push(o);
  }

  function isOpen() {
    if (closed) return false;
    if (mode === 'host') return peerOpen;
    return connOpen;
  }

  function close() {
    closed = true;
    clearTimers();
    mode = null;
    peerOpen = false;
    connOpen = false;
    queue = [];
    try { if (myConn) myConn.close(); } catch (e) {}
    myConn = null;
    try { if (peer) peer.destroy(); } catch (e) {}
    peer = null;
    resetHostState();
    pending.clear();
  }

  return { connect: connect, send: send, isOpen: isOpen, close: close };
});