const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');
const Multiverse = require('../public/js/engine.js');
const CARD_POOL = require('../public/js/cards.js');

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.json({ limit: '3mb' }));
// never cache the client assets so every edit shows up right away
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
// allow the Android app / any origin to call the account API (CORS)
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const rooms = new Map(); // code -> room
const COINS_PER_WIN = 50;

/* dev-only: latest modified time across public/ so the browser can auto-reload */
function publicVersion() {
  let latest = 0;
  try {
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else {
          const st = fs.statSync(p);
          if (st.mtimeMs > latest) latest = st.mtimeMs;
        }
      }
    };
    walk(path.join(__dirname, '..', 'public'));
  } catch (e) { /* ignore */ }
  return latest;
}

app.get('/__live', (req, res) => {
  res.json({ v: publicVersion() });
});

/* ===== accounts (simple JSON storage) ===== */
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const sessions = new Map(); // token -> account key (lowercased name)

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch (e) { return {}; }
}
let users = loadUsers();

function saveUsers() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) { console.error('[accounts] save failed:', e); }
}

function hashPassword(pw, salt) {
  return crypto.scryptSync(String(pw), salt, 32).toString('hex');
}
function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}
function cleanAvatar(av) {
  av = String(av || '').slice(0, 3000);
  if (!/^(https?:\/\/|data:image\/)/i.test(av)) return '';
  return av;
}
function publicUser(u) {
  return {
    name: u.name, avatar: u.avatar,
    gamesPlayed: u.gamesPlayed || 0, gamesWon: u.gamesWon || 0, coins: u.coins || 0
  };
}
function userByToken(token) {
  const key = sessions.get(String(token || ''));
  return (key && users[key]) ? users[key] : null;
}

// register/login/logout/me (HTTP)
app.post('/api/register', (req, res) => {
  const name = String((req.body && req.body.name) || '').trim().slice(0, 16);
  const pw = String((req.body && req.body.password) || '');
  const avatar = cleanAvatar(req.body && req.body.avatar);
  if (name.length < 2) return res.status(400).json({ error: 'الاسم قصير جدًا (حرفين على الأقل)' });
  if (/[^a-zA-Z0-9\u0600-\u06FF _-]/.test(name)) return res.status(400).json({ error: 'الاسم فيه رموز ممنوعة' });
  if (pw.length < 4) return res.status(400).json({ error: 'كلمة المرور أقصر من 4 حروف' });
  const key = name.toLowerCase();
  if (users[key]) return res.status(400).json({ error: 'الاسم موجود بالفعل' });
  const salt = crypto.randomBytes(16).toString('hex');
  users[key] = {
    name, avatar, salt,
    passwordHash: hashPassword(pw, salt),
    gamesPlayed: 0, gamesWon: 0, coins: 0, createdAt: Date.now()
  };
  saveUsers();
  const token = makeToken();
  sessions.set(token, key);
  res.json({ token, user: publicUser(users[key]) });
});

app.post('/api/login', (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();
  const pw = String((req.body && req.body.password) || '');
  const key = name.toLowerCase();
  const user = users[key];
  if (!user) return res.status(400).json({ error: 'الاسم غير موجود' });
  if (user.passwordHash !== hashPassword(pw, user.salt)) return res.status(400).json({ error: 'كلمة المرور غلط' });
  const token = makeToken();
  sessions.set(token, key);
  res.json({ token, user: publicUser(user) });
});

app.post('/api/logout', (req, res) => {
  sessions.delete(String((req.body && req.body.token) || ''));
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const user = userByToken(req.query.token);
  if (!user) return res.status(401).json({ error: 'not logged in' });
  res.json({ user: publicUser(user) });
});

function makeCode(len) {
  len = len || 6;
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return out;
}

function cleanName(name) {
  name = String(name || '').trim().slice(0, 16);
  return name || 'لاعب';
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function effectiveName(ws, fallback) {
  const u = userByToken(ws.token);
  return u ? u.name : cleanName(fallback);
}

// When an online game ends, credit accounts: games played (+1 for everyone in),
// games won & coins (+COINS_PER_WIN for winners). Runs exactly once per room.
function awardStats(room) {
  if (!room.game || room.game.phase !== 'ended' || room.awarded) return;
  room.awarded = true;
  const winners = room.game.winnerIds || [];
  const byKey = new Map(); // account key -> { played, won }
  for (const gp of room.game.players) {
    const rp = room.players.get(gp.id);
    const key = rp && rp.accountKey;
    if (!key || !users[key]) continue;
    const rec = byKey.get(key) || { played: false, won: false };
    rec.played = true;
    if (winners.includes(gp.id)) rec.won = true;
    byKey.set(key, rec);
  }
  for (const [key, rec] of byKey) {
    const u = users[key];
    if (rec.played) u.gamesPlayed = (u.gamesPlayed || 0) + 1;
    if (rec.won) { u.gamesWon = (u.gamesWon || 0) + 1; u.coins = (u.coins || 0) + COINS_PER_WIN; }
  }
  if (byKey.size) saveUsers();
  for (const p of room.players.values()) {
    if (!p.connected || !p.accountKey || !users[p.accountKey]) continue;
    const u = users[p.accountKey];
    const won = winners.includes(p.id);
    send(p.ws, {
      t: 'stats',
      won,
      coinsGained: won ? COINS_PER_WIN : 0,
      user: publicUser(u)
    });
  }
}

function broadcast(room) {
  awardStats(room);
  for (const p of room.players.values()) {
    if (!p.connected) continue;
    const snap = room.game ? Multiverse.snapshot(room.game, p.id) : null;
    send(p.ws, {
      t: 'state',
      code: room.code,
      hostId: room.hostId,
      started: room.started,
      you: p.id,
      players: [...room.players.values()].map((x) => ({
        id: x.id, name: x.name, host: x.id === room.hostId, connected: x.connected, avatar: x.avatar || ''
      })),
      snapshot: snap
    });
  }
}

function joinRoom(ws, room, name) {
  if (ws.roomCode) leaveRoom(ws);
  const u = userByToken(ws.token);
  const player = {
    id: 'p' + Math.random().toString(36).slice(2, 8),
    name: name,
    ws: ws,
    connected: true,
    accountKey: u ? u.name.toLowerCase() : null,
    avatar: u ? (u.avatar || '') : ''
  };
  ws.roomCode = room.code;
  ws.playerId = player.id;
  room.players.set(player.id, player);
  if (room.hostId === null) room.hostId = player.id;
  broadcast(room);
  send(ws, { t: 'chatHistory', messages: room.chat });
}

function leaveRoom(ws) {
  if (!ws.roomCode) return;
  const room = rooms.get(ws.roomCode);
  ws.roomCode = null;
  ws.playerId = null;
  if (!room) return;
  const player = room.players.get(ws.playerId);
  if (player) {
    room.players.delete(player.id);
    if (room.hostId === player.id) {
      const next = [...room.players.values()][0];
      room.hostId = next ? next.id : null;
    }
  }
  if (room.players.size === 0) {
    if (room.timer) clearTimeout(room.timer);
    rooms.delete(room.code);
  } else {
    broadcast(room);
  }
}

function handleMessage(ws, msg) {
  switch (msg.t) {
    case 'auth': {
      const u = userByToken(msg.token);
      ws.token = u ? String(msg.token) : null;
      if (u) send(ws, { t: 'authed', user: publicUser(u) });
      break;
    }
    case 'create': {
      const code = makeCode();
      while (rooms.has(code)) code = makeCode();
      const room = { code, hostId: null, started: false, game: null, players: new Map(), timer: null, awarded: false, chat: [] };
      rooms.set(code, room);
      joinRoom(ws, room, effectiveName(ws, msg.name));
      break;
    }
    case 'join': {
      const code = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      const room = rooms.get(code);
      if (!room) return send(ws, { t: 'error', msg: 'الكود غير موجود' });
      if (room.started) return send(ws, { t: 'error', msg: 'اللعبة بدأت بالفعل' });
      if (room.players.size >= 4) return send(ws, { t: 'error', msg: 'الروم ممتلئ (4 لاعبين)' });
      joinRoom(ws, room, effectiveName(ws, msg.name));
      break;
    }
    case 'leave': leaveRoom(ws); break;
    case 'start': {
      const room = rooms.get(ws.roomCode);
      if (!room || room.started) return;
      if (ws.playerId !== room.hostId) return send(ws, { t: 'error', msg: 'أنت لست المضيف' });
      const connected = [...room.players.values()].filter((p) => p.connected);
      if (connected.length < 2) return send(ws, { t: 'error', msg: 'تحتاج لاعبين على الأقل' });
      room.game = Multiverse.createGame({
        players: connected.map((p) => ({ id: p.id, name: p.name, isAI: false, avatar: p.avatar || '' })),
        cards: CARD_POOL
      });
      room.started = true;
      room.timer = null;
      room.game.turnDeadline = Date.now() + 30000;
      schedulePhaseTimer(room);
      broadcast(room);
      break;
    }
    case 'chooseType': {
      const room = rooms.get(ws.roomCode);
      if (!room || !room.game) return;
      const res = Multiverse.chooseRoundType(room.game, ws.playerId, msg.stat);
      if (res.error) return send(ws, { t: 'error', msg: res.error });
      broadcast(room);
      break;
    }
    case 'play': {
      const room = rooms.get(ws.roomCode);
      if (!room || !room.game) return;
      const res = Multiverse.playCards(room.game, ws.playerId, msg.cards || msg.cardIds);
      if (res.error) return send(ws, { t: 'error', msg: res.error });
      if (room.game.phase === 'revealed' || room.game.phase === 'ended') {
        scheduleContinue(room);
      }
      broadcast(room);
      break;
    }
    case 'continue': {
      const room = rooms.get(ws.roomCode);
      if (!room || !room.game) return;
      if (room.timer) { clearTimeout(room.timer); room.timer = null; }
      const res = Multiverse.continueAfterReveal(room.game);
      if (res.error) return send(ws, { t: 'error', msg: res.error });
      room.game.turnDeadline = Date.now() + 30000;
      schedulePhaseTimer(room);
      broadcast(room);
      break;
    }
    case 'swap': {
      const room = rooms.get(ws.roomCode);
      if (!room || !room.game) return;
      const res = Multiverse.resolveSwap(room.game, ws.playerId, msg.handCardId || null);
      if (res.error) return send(ws, { t: 'error', msg: res.error });
      for (const p of room.players.values()) {
        if (!p.connected) continue;
        send(p.ws, { t: 'swapEvt', by: ws.playerId });
      }
      broadcast(room);
      break;
    }
    case 'useLoki': {
      const room = rooms.get(ws.roomCode);
      if (!room || !room.game) return;
      const res = Multiverse.useLoki(room.game, ws.playerId, msg.targetId);
      if (res.error) return send(ws, { t: 'error', msg: res.error });
      const target = room.game.players.find((p) => p.id === msg.targetId);
      for (const p of room.players.values()) {
        if (!p.connected) continue;
        const ev = { t: 'steal', by: ws.playerId, target: msg.targetId };
        if (p.id === ws.playerId) {
          ev.stolenName = res.stolenName;
          ev.targetName = target ? target.name : '؟';
        }
        send(p.ws, ev);
      }
      broadcast(room);
      break;
    }
    case 'twoFace': {
      const room = rooms.get(ws.roomCode);
      if (!room || !room.game) return;
      const res = Multiverse.useTwoFace(room.game, ws.playerId);
      if (res.error) return send(ws, { t: 'error', msg: res.error });
      if (res.ok) send(ws, { t: 'twoFaceEvt', drawn: res.drawn });
      broadcast(room);
      break;
    }
    case 'hela': {
      const room = rooms.get(ws.roomCode);
      if (!room || !room.game) return;
      const res = Multiverse.useHela(room.game, ws.playerId, msg.targetId);
      if (res.error) return send(ws, { t: 'error', msg: res.error });
      const target = room.game.players.find((p) => p.id === msg.targetId);
      for (const p of room.players.values()) {
        if (!p.connected) continue;
        const ev = { t: 'helaEvt', by: ws.playerId, target: msg.targetId };
        if (p.id === ws.playerId) {
          ev.discardedName = res.discardedName;
          ev.targetName = target ? target.name : '؟';
        }
        send(p.ws, ev);
      }
      broadcast(room);
      break;
    }
    case 'kilgraveTarget': {
      const room = rooms.get(ws.roomCode);
      if (!room || !room.game) return;
      const opts = Multiverse.kilgraveOptions(room.game, msg.targetId);
      if (opts.error) return send(ws, { t: 'error', msg: opts.error });
      const target = room.game.players.find((p) => p.id === msg.targetId);
      send(ws, { t: 'kilgraveTargets', targetId: msg.targetId, targetName: target ? target.name : '؟', cardIds: opts.cardIds });
      break;
    }
    case 'useKilgrave': {
      const room = rooms.get(ws.roomCode);
      if (!room || !room.game) return;
      const res = Multiverse.useKilgrave(room.game, ws.playerId, msg.targetId, msg.cardId);
      if (res.error) return send(ws, { t: 'error', msg: res.error });
      const by = room.game.players.find((p) => p.id === ws.playerId);
      const target = room.game.players.find((p) => p.id === msg.targetId);
      for (const p of room.players.values()) {
        if (!p.connected) continue;
        send(p.ws, {
          t: 'kilgraveEvt',
          by: ws.playerId,
          byName: by ? by.name : '؟',
          target: msg.targetId,
          targetName: target ? target.name : '؟'
        });
      }
      broadcast(room);
      break;
    }
    case 'riddler': {
      const room = rooms.get(ws.roomCode);
      if (!room || !room.game) return;
      const res = Multiverse.useRiddler(room.game, ws.playerId);
      if (res.error) return send(ws, { t: 'error', msg: res.error });
      const by = room.game.players.find((p) => p.id === ws.playerId);
      for (const p of room.players.values()) {
        if (!p.connected) continue;
        const ev = { t: 'riddlerEvt', by: ws.playerId, byName: by ? by.name : '؟' };
        if (p.id === ws.playerId) ev.peeks = res.peeks; // only the user sees the peeks
        send(p.ws, ev);
      }
      broadcast(room);
      break;
    }
    case 'mrFreezeTarget': {
      const room = rooms.get(ws.roomCode);
      if (!room || !room.game) return;
      const opts = Multiverse.kilgraveOptions(room.game, msg.targetId);
      if (opts.error) return send(ws, { t: 'error', msg: opts.error });
      const target = room.game.players.find((p) => p.id === msg.targetId);
      send(ws, { t: 'mrFreezeTargets', targetId: msg.targetId, targetName: target ? target.name : '؟', cardIds: opts.cardIds });
      break;
    }
    case 'useMrFreeze': {
      const room = rooms.get(ws.roomCode);
      if (!room || !room.game) return;
      const res = Multiverse.useMrFreeze(room.game, ws.playerId, msg.targetId, msg.cardId);
      if (res.error) return send(ws, { t: 'error', msg: res.error });
      const by = room.game.players.find((p) => p.id === ws.playerId);
      const target = room.game.players.find((p) => p.id === msg.targetId);
      for (const p of room.players.values()) {
        if (!p.connected) continue;
        send(p.ws, {
          t: 'mrFreezeEvt',
          by: ws.playerId,
          byName: by ? by.name : '؟',
          target: msg.targetId,
          targetName: target ? target.name : '؟'
        });
      }
      broadcast(room);
      break;
    }
    case 'translucent': {
      const room = rooms.get(ws.roomCode);
      if (!room || !room.game) return;
      const res = Multiverse.useTranslucent(room.game, ws.playerId);
      if (res.error) return send(ws, { t: 'error', msg: res.error });
      const by = room.game.players.find((p) => p.id === ws.playerId);
      for (const p of room.players.values()) {
        if (!p.connected) continue;
        send(p.ws, { t: 'translucentEvt', by: ws.playerId, byName: by ? by.name : '؟' });
      }
      broadcast(room);
      break;
    }
    case 'useReverseFlash': {
      const room = rooms.get(ws.roomCode);
      if (!room || !room.game) return;
      const res = Multiverse.useReverseFlash(room.game, ws.playerId, msg.playedCardId, msg.handCardId);
      if (res.error) return send(ws, { t: 'error', msg: res.error });
      for (const p of room.players.values()) {
        if (!p.connected) continue;
        send(p.ws, { t: 'saveEvt', by: ws.playerId });
      }
      broadcast(room);
      break;
    }
    case 'chat': {
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      const p = room.players.get(ws.playerId);
      if (!p) return;
      const kind = (msg.kind === 'emoji' || msg.kind === 'sound') ? msg.kind : 'text';
      const text = kind === 'text' ? String(msg.text || '').trim().slice(0, 300) : '';
      const emoji = kind === 'emoji' ? String(msg.emoji || '').trim().slice(0, 32) : '';
      const sound = kind === 'sound' ? String(msg.sound || '').trim().slice(0, 40) : '';
      const soundName = kind === 'sound' ? String(msg.soundName || '').trim().slice(0, 40) : '';
      if (!text && !emoji && !sound) return;
      const chatMsg = {
        t: 'chat',
        from: ws.playerId,
        name: p.name,
        avatar: p.avatar || '',
        kind,
        text,
        emoji,
        sound,
        soundName,
        ts: Date.now()
      };
      room.chat.push(chatMsg);
      if (room.chat.length > 100) room.chat.shift();
      for (const op of room.players.values()) {
        if (op.connected) send(op.ws, chatMsg);
      }
      break;
    }
    case 'skipPhase': {
      const room = rooms.get(ws.roomCode);
      if (!room || !room.game) return;
      const res = Multiverse.skipPhaseTurn(room.game, ws.playerId);
      if (res.error) return send(ws, { t: 'error', msg: res.error });
      schedulePhaseTimer(room);
      broadcast(room);
      break;
    }
    case 'ping': send(ws, { t: 'pong' }); break;
  }
}

function scheduleContinue(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(() => {
    room.timer = null;
    if (!room.game) return;
    if (room.game.phase === 'revealed') {
      Multiverse.continueAfterReveal(room.game);
      broadcast(room);
    } else if (room.game.phase === 'swap') {
      Multiverse.resolveSwap(room.game, room.game.swapPlayerId, null);
      broadcast(room);
    }
  }, 12000);
}

function schedulePhaseTimer(room) {
  if (room.phaseTimer) clearTimeout(room.phaseTimer);
  room.phaseTimer = setTimeout(() => {
    if (!room.game) return;
    Multiverse.skipPhaseTurn(room.game, room.game.phaseTurnId);
    broadcast(room);
    // Recurse for next phase's timer
    schedulePhaseTimer(room);
  }, 30000);
}

wss.on('connection', (ws) => {
  ws.roomCode = null;
  ws.playerId = null;
  ws.token = null;
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    try {
      handleMessage(ws, msg);
    } catch (err) {
      console.error('[ws] error handling message:', err);
      try { send(ws, { t: 'error', msg: 'خطأ داخلي' }); } catch (_) {}
    }
  });
  ws.on('close', () => {
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    const player = room.players.get(ws.playerId);
    if (!player) return;
    player.connected = false;
    if (!room.started) {
      room.players.delete(player.id);
      if (room.hostId === player.id) {
        const next = [...room.players.values()][0];
        room.hostId = next ? next.id : null;
      }
      if (room.players.size === 0) {
        if (room.timer) clearTimeout(room.timer);
        rooms.delete(room.code);
        return;
      }
    } else if (room.game) {
      if (room.phaseTimer) { clearTimeout(room.phaseTimer); room.phaseTimer = null; }
      schedulePhaseTimer(room);
    }
    broadcast(room);
  });
});

server.listen(PORT, () => {
  console.log('Multiverse server running at http://localhost:' + PORT);
});
