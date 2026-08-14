/* Multiverse game engine — runs in browser AND on the Node server. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Multiverse = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STATS = ['attack', 'intelligence', 'defense'];
  var STAT_LABELS = { attack: 'هجوم', intelligence: 'ذكاء', defense: 'دفاع' };
  var DEFAULT_WIN_POINTS = 7;
  var HAND_SIZE = 7;
  var PHASE_TURN_MS = 30000;

  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function createCard(id, specialty) {
    var card = { id: id, specialty: specialty, attack: 0, intelligence: 0, defense: 0 };
    for (var i = 0; i < STATS.length; i++) {
      card[STATS[i]] = STATS[i] === specialty ? randInt(420, 720) : randInt(100, 380);
    }
    return card;
  }

  function createDeck(size) {
    size = size || 84;
    var deck = [];
    for (var i = 0; i < size; i++) {
      deck.push(createCard('c' + i, STATS[i % 3]));
    }
    return shuffle(deck);
  }

  // Build a deck from a card pool (name/img/rarity + attack/intelligence/defense)
  function buildDeck(cards) {
    if (cards && cards.length) {
      return shuffle(cards.map(function (c, i) {
        var s = c.specialty;
        if (!s) {
          s = 'attack';
          if (c.intelligence > c.attack && c.intelligence >= c.defense) s = 'intelligence';
          else if (c.defense > c.attack && c.defense > c.intelligence) s = 'defense';
        }
        return {
          id: c.id != null ? c.id : 'c' + i,
          name: c.name || 'كارت ' + (i + 1),
          img: c.img || '',
          rarity: c.rarity || 'common',
          specialty: s,
          attack: c.attack || 0,
          intelligence: c.intelligence || 0,
          defense: c.defense || 0,
          special: c.special || null,
          bonus: c.bonus || 0
        };
      }));
    }
    return createDeck();
  }

  function getPlayer(game, id) {
    for (var i = 0; i < game.players.length; i++) if (game.players[i].id === id) return game.players[i];
    return null;
  }

  function activePlayers(game) {
    return game.players.filter(function (p) { return !p.eliminated; });
  }

  function activeOrder(game) {
    return game.order.filter(function (id) {
      var p = getPlayer(game, id);
      return p && !p.eliminated;
    });
  }

  // The player who will choose the round type (same formula as beginRound).
  // During preRound this is NOT yet stored on the game, so we compute it.
  function currentChooser(game) {
    var order = activeOrder(game);
    if (!order.length) return null;
    return order[(game.startIndex + (game.round - 1)) % order.length];
  }

  // A card that can be played DURING a round: real characters only.
  // Bonus cards (+100..+500) need a character, Loki/Reverse Flash play in their own phases.
  function isRoundPlayable(card) {
    return !!card && !card.bonus && !card.special;
  }

  function canPlayCharacter(player) {
    for (var i = 0; i < player.hand.length; i++) if (isRoundPlayable(player.hand[i])) return true;
    return false;
  }

  function isFrozen(game, playerId, cardId) {
    for (var i = 0; i < game.frozenCards.length; i++) {
      if (game.frozenCards[i].playerId === playerId && game.frozenCards[i].cardId === cardId) return true;
    }
    return false;
  }

  // A player is invisible (Translucent) this round — no one may target them with
  // any card effect (Loki/Hela/Kilgrave/Riddler/Mr. Freeze/Black Noir).
  function isInvisible(game, playerId) {
    for (var i = 0; i < game.invisible.length; i++) {
      if (game.invisible[i].playerId === playerId && game.invisible[i].untilRound >= game.round) return true;
    }
    return false;
  }

  // a character that can actually be committed this round (not frozen by Mr. Freeze)
  function canPlayCharacterUnfrozen(game, player) {
    for (var i = 0; i < player.hand.length; i++) {
      var c = player.hand[i];
      if (isRoundPlayable(c) && !isFrozen(game, player.id, c.id)) return true;
    }
    return false;
  }

  function createGame(config) {
    var cfg = config || {};
    var players = (cfg.players || []).map(function (p, i) {
      return {
        id: p.id,
        name: p.name,
        isAI: !!p.isAI,
        seat: i,
        avatar: p.avatar || '',
        hand: [],
        points: 0,
        eliminated: false,
        exitedRound: null,
        lastPlay: null
      };
    });
    var deck = cfg.deck || buildDeck(cfg.cards);
    var game = {
      cfg: { winPoints: cfg.winPoints || DEFAULT_WIN_POINTS, spectate: !!cfg.spectate },
      players: players,
      deck: deck,
      discard: [],
      round: 0,
      phase: 'preRound',
      roundType: null,
      chooserId: null,
      currentPlayerId: null,
      order: players.map(function (p) { return p.id; }),
      startIndex: Math.floor(Math.random() * players.length),
      revealInfo: null,
      winnerIds: [],
      phaseQueue: [],
      phaseTurnId: null,
      turnDeadline: null,
      forcedPlays: [], // [{ playerId, cardId, by }] — Kilgrave mind-control forced plays
      kilgraveUsed: false, // Kilgrave works only once per round
      frozenCards: [], // [{ playerId, cardId, untilRound }] — Mr. Freeze frozen cards
      blackNoirSwaps: [], // [{ by, with }] — score swaps done with Black Noir
      invisible: [] // [{ playerId, untilRound }] — Translucent invisibility (can't be targeted)
    };
    for (var i = 0; i < HAND_SIZE; i++) {
      for (var j = 0; j < players.length; j++) players[j].hand.push(deck.pop());
    }
    startRound(game, true);
    return game;
  }

  function drawCard(game, player) {
    var card = game.deck.pop();
    if (!card) {
      game.deck = shuffle(game.discard);
      game.discard = [];
      card = game.deck.pop();
    }
    if (card) player.hand.push(card);
    return card;
  }

  /* ===== phase flow =====
     preRound -> chooseType -> playing -> revealed -> postRound -> (next) preRound -> ... -> ended */

  function startRound(game, skipDraw) {
    game.round++;
    game.forcedPlays = []; // Kilgrave effects are per-round
    game.kilgraveUsed = false; // Kilgrave can be used only once per round
    game.blackNoirSwaps = []; // Black Noir effects are per-round
    // Mr. Freeze freezes last 2 rounds: drop expired entries
    game.frozenCards = game.frozenCards.filter(function (f) { return f.untilRound > game.round; });
    // Translucent invisibility lasts 2 rounds: drop expired entries
    game.invisible = game.invisible.filter(function (f) { return f.untilRound >= game.round; });
    if (!skipDraw) {
      var actives = activePlayers(game);
      for (var i = 0; i < actives.length; i++) drawCard(game, actives[i]);
    }
    for (var j = 0; j < game.players.length; j++) game.players[j].lastPlay = null;
    startPreRound(game);
  }

  function startPreRound(game) {
    game.phase = 'preRound';
    game.roundType = null;
    game.chooserId = null;
    game.currentPlayerId = null;
    game.revealInfo = null;
    var order = activeOrder(game);
    // rotate who starts the special-card phase: round 1 starts from the first
    // active player, then the second, the third, ... so the order is never the
    // same two rounds in a row
    var off = (game.round - 1) % order.length;
    game.phaseQueue = order.slice(off).concat(order.slice(0, off));
    advancePhaseTurn(game);
  }

  function beginRound(game) {
    game.phase = 'chooseType';
    var order = activeOrder(game);
    if (!order.length) { game.phase = 'ended'; game.winnerIds = []; return; }
    game.chooserId = order[(game.startIndex + (game.round - 1)) % order.length];
    game.currentPlayerId = game.chooserId;
    game.phaseQueue = [];
    game.phaseTurnId = null;
    game.turnDeadline = null;
  }

  function startPostRound(game) {
    game.phase = 'postRound';
    game.phaseQueue = activeOrder(game);
    advancePhaseTurn(game);
  }

  // move to the next turn in the current phase, or finish the phase
  function advancePhaseTurn(game) {
    while (game.phaseQueue.length) {
      var id = game.phaseQueue.shift();
      var p = getPlayer(game, id);
      if (p && !p.eliminated) {
        game.phaseTurnId = id;
        game.turnDeadline = Date.now() + PHASE_TURN_MS;
        return;
      }
    }
    game.phaseTurnId = null;
    game.turnDeadline = null;
    if (game.phase === 'preRound') {
      beginRound(game);
    } else if (game.phase === 'postRound') {
      startRound(game);
    }
  }

  function finishPhaseTurn(game, playerId) {
    if (game.phase !== 'preRound' && game.phase !== 'postRound') return { error: 'مش في مرحلة' };
    if (game.phaseTurnId !== playerId) return { error: 'ليس دورك' };
    advancePhaseTurn(game);
    return { ok: true };
  }

  function skipPhaseTurn(game, playerId) {
    return finishPhaseTurn(game, playerId);
  }

  function canAct(game, playerId) {
    var p = getPlayer(game, playerId);
    if (!p || p.eliminated) return false;
    if (game.phase === 'chooseType') return playerId === game.chooserId;
    if (game.phase === 'playing') return playerId === game.currentPlayerId;
    if (game.phase === 'preRound' || game.phase === 'postRound') return playerId === game.phaseTurnId;
    return false;
  }

  function chooseRoundType(game, playerId, stat) {
    if (!canAct(game, playerId)) return { error: 'ليس دورك' };
    if (game.phase !== 'chooseType') return { error: 'لا يمكن اختيار النوع الآن' };
    if (STATS.indexOf(stat) < 0) return { error: 'نوع غير صالح' };
    game.roundType = stat;
    game.phase = 'playing';
    skipNoCharacterPlayers(game);
    return { ok: true };
  }

  // players who have NO character card in hand can't play this round: auto-skip
  function skipNoCharacterPlayers(game) {
    var guard = 0;
    while (game.phase === 'playing' && game.currentPlayerId) {
      var cur = getPlayer(game, game.currentPlayerId);
      if (!cur || cur.lastPlay) break;
      if (canPlayCharacterUnfrozen(game, cur)) break;
      cur.lastPlay = { count: 0, cardIds: [], cards: [], total: 0, skipped: true };
      advancePlayTurn(game);
      if (++guard > 30) break;
    }
  }

  // advance to the next player who hasn't played and HAS a character to play;
  // players stuck without a character are auto-skipped along the way
  function advancePlayTurn(game) {
    var order = activeOrder(game);
    var idx = game.order.indexOf(game.currentPlayerId);
    var guard = 0;
    while (guard++ < game.order.length * 2) {
      var allDone = true;
      for (var i = 0; i < order.length; i++) {
        if (!getPlayer(game, order[i]).lastPlay) { allDone = false; break; }
      }
      if (allDone) { revealRound(game); return; }
      idx = (idx + 1) % game.order.length;
      var cand = game.order[idx];
      var cp = getPlayer(game, cand);
      if (!cp || cp.eliminated || cp.lastPlay) continue;
      if (!canPlayCharacterUnfrozen(game, cp)) {
        cp.lastPlay = { count: 0, cardIds: [], cards: [], total: 0, skipped: true };
        continue;
      }
      game.currentPlayerId = cand;
      return;
    }
    revealRound(game);
  }

  function playCards(game, playerId, cardIds) {
    if (!canAct(game, playerId)) return { error: 'ليس دورك' };
    if (game.phase !== 'playing') return { error: 'لا يمكن اللعب الآن' };
    var p = getPlayer(game, playerId);
    var unique = [];
    for (var i = 0; i < cardIds.length; i++) if (unique.indexOf(cardIds[i]) < 0) unique.push(cardIds[i]);
    if (unique.length === 0) return { error: 'العب كارت واحد على الأقل' };
    var handIds = p.hand.map(function (c) { return c.id; });
    for (var j = 0; j < unique.length; j++) {
      if (handIds.indexOf(unique[j]) < 0) return { error: 'كارت غير موجود في يدك' };
    }
    var cards = unique.map(function (id) {
      for (var k = 0; k < p.hand.length; k++) if (p.hand[k].id === id) return p.hand[k];
      return null;
    });
    var hasChar = false, hasSpecial = false, hasBonus = false, hasBlackNoir = false;
    for (var b = 0; b < cards.length; b++) {
      if (cards[b].special === 'blacknoir') hasBlackNoir = true;
      if (cards[b].special) hasSpecial = true;
      else if (cards[b].bonus) hasBonus = true;
      else hasChar = true;
    }
    // Black Noir is the only special that plays DURING a round
    if (hasSpecial && !hasBlackNoir) return { error: 'الكروت الخاصة بتتلعب قبل الجولة' };
    if (hasBlackNoir && unique.length < 2) return { error: 'Black Noir لازم يلتعب مع كارت تاني' };
    if (hasBlackNoir && game.chooserId === playerId) return { error: 'Black Noir ماتقدرش تستعمله وانت بتحدد نوع الجولة' };
    if (hasBlackNoir) {
      var chooser = getPlayer(game, game.chooserId);
      if (!chooser || chooser.eliminated) return { error: 'اللاعب المحدد للنوع خرج' };
      if (isInvisible(game, game.chooserId)) return { error: 'Black Noir مش هيشتغل — ' + chooser.name + ' مختفي' };
    }
    if (hasBonus && !hasChar) return { error: 'كارت + لازم يتلعب مع كارت شخصية' };
    if (!hasChar) return { error: 'العب كارت شخصية واحد على الأقل' };
    // Mr. Freeze: frozen cards can't be played until the freeze expires
    for (var fz0 = 0; fz0 < unique.length; fz0++) {
      if (isFrozen(game, playerId, unique[fz0])) return { error: 'الكارت دا متجمد من Mr. Freeze — مش هتقدر تلعبه' };
    }
    // Kilgrave: a forced card must be included and can't be swapped out
    for (var fz = 0; fz < game.forcedPlays.length; fz++) {
      if (game.forcedPlays[fz].playerId === playerId) {
        var fid = game.forcedPlays[fz].cardId;
        var fInHand = handIds.indexOf(fid) >= 0;
        if (fInHand) {
          if (unique.indexOf(fid) < 0) return { error: 'مجبور تلعب الكارت اللي Kilgrave اجبرك عليه' };
        } else {
          // the forced card left the hand (stolen/destroyed): requirement is void
          game.forcedPlays = game.forcedPlays.filter(function (f2) { return f2.playerId !== playerId; });
        }
        break;
      }
    }
    p.hand = p.hand.filter(function (c) { return unique.indexOf(c.id) < 0; });
    if (hasBlackNoir) game.blackNoirSwaps.push({ by: playerId, with: game.chooserId });
    p.lastPlay = { count: cards.length, cardIds: unique.slice(), cards: cards, total: null, skipped: false };
    advancePlayTurn(game);
    return { ok: true };
  }

  // Value a card contributes in a round: bonus cards (+100..+500) only add
  // their bonus on top of a character card; characters add their own stat.
  // Black Noir itself adds 0 — its whole point is swapping scores.
  function cardValue(card, stat) {
    if (card.special === 'blacknoir') return 0;
    if (card.bonus) return card.bonus;
    return (card[stat] || 0) + (card.bonus || 0);
  }

  function playTotal(game, player) {
    var total = 0;
    for (var j = 0; j < player.lastPlay.cards.length; j++) {
      total += cardValue(player.lastPlay.cards[j], game.roundType);
    }
    return total;
  }

  function revealRound(game) {
    var order = activeOrder(game);
    for (var i = 0; i < order.length; i++) {
      var p = getPlayer(game, order[i]);
      p.lastPlay.total = p.lastPlay.count > 0 ? playTotal(game, p) : 0;
    }
    // Black Noir: swap the committed scores between the player and this round's chooser
    for (var s = 0; s < game.blackNoirSwaps.length; s++) {
      var bp = getPlayer(game, game.blackNoirSwaps[s].by);
      var wp = getPlayer(game, game.blackNoirSwaps[s].with);
      if (bp && wp && bp.lastPlay && wp.lastPlay && bp.lastPlay.count > 0 && wp.lastPlay.count > 0) {
        var t = bp.lastPlay.total;
        bp.lastPlay.total = wp.lastPlay.total;
        wp.lastPlay.total = t;
      }
    }
    finalizeRound(game);
  }

  function finalizeRound(game) {
    var order = activeOrder(game);
    var maxTotal = -1;
    var anyPlayed = false;
    for (var i = 0; i < order.length; i++) {
      var p = getPlayer(game, order[i]);
      if (p.lastPlay.count > 0) {
        anyPlayed = true;
        if (p.lastPlay.total > maxTotal) maxTotal = p.lastPlay.total;
      }
    }
    var winners = [];
    if (anyPlayed) {
      for (var w = 0; w < order.length; w++) {
        var pl = getPlayer(game, order[w]);
        if (pl.lastPlay.count > 0 && pl.lastPlay.total === maxTotal) winners.push(pl.id);
      }
      for (var a = 0; a < order.length; a++) {
        var ppl = getPlayer(game, order[a]);
        if (winners.indexOf(ppl.id) >= 0) ppl.points += 1;
      }
    }
    // exit rule: emptying your hand ends your run — unless you reached the win points
    for (var e = 0; e < order.length; e++) {
      var pe = getPlayer(game, order[e]);
      if (pe.lastPlay.count > 0 && pe.hand.length === 0 && pe.points < game.cfg.winPoints) {
        pe.eliminated = true;
        pe.exitedRound = pe.exitedRound == null ? game.round : pe.exitedRound;
      }
    }
    game.revealInfo = {
      roundType: game.roundType,
      winners: winners.slice(),
      blackNoirSwaps: game.blackNoirSwaps.slice(),
      plays: order.map(function (id) {
        var pp = getPlayer(game, id);
        var skipped = !(pp.lastPlay && pp.lastPlay.count > 0);
        var forced = null;
        for (var fp = 0; fp < game.forcedPlays.length; fp++) {
          if (game.forcedPlays[fp].playerId === id) { forced = game.forcedPlays[fp]; break; }
        }
        return {
          playerId: id,
          name: pp.name,
          count: pp.lastPlay ? pp.lastPlay.count : 0,
          total: pp.lastPlay ? pp.lastPlay.total : 0,
          cards: (pp.lastPlay && pp.lastPlay.cards) ? pp.lastPlay.cards.slice() : [],
          won: winners.indexOf(id) >= 0,
          skipped: skipped,
          eliminated: pp.eliminated,
          forcedId: forced ? forced.cardId : null,
          forcedBy: forced ? forced.by : null
        };
      })
    };
    for (var d = 0; d < order.length; d++) {
      var dp = getPlayer(game, order[d]);
      if (dp.lastPlay && dp.lastPlay.cards) game.discard = game.discard.concat(dp.lastPlay.cards);
      dp.lastPlay = null;
    }
    var actives = activePlayers(game);
    var endWinners = checkEnd(game, actives);
    if (endWinners) {
      game.phase = 'ended';
      game.winnerIds = endWinners;
    } else {
      game.phase = 'revealed';
    }
  }

  function checkEnd(game, actives) {
    // 1) first to reach the win points wins (immediately)
    var byPoints = game.players.filter(function (p) { return !p.eliminated && p.points >= game.cfg.winPoints; });
    if (byPoints.length > 0) return byPoints.map(function (p) { return p.id; });
    // 2) only one player still in -> he wins, regardless of points
    //    (except spectate mode: keep simulating so spectators can watch)
    if (actives.length === 1 && !game.cfg.spectate) return [actives[0].id];
    // 3) everyone exited -> most points wins; tie -> the one who stayed in longest; tie -> draw
    if (actives.length === 0) {
      var maxP = -1;
      for (var i = 0; i < game.players.length; i++) if (game.players[i].points > maxP) maxP = game.players[i].points;
      var top = game.players.filter(function (p) { return p.points === maxP; });
      if (top.length > 1) {
        var latest = -1;
        for (var t = 0; t < top.length; t++) if ((top[t].exitedRound || 0) > latest) latest = top[t].exitedRound;
        top = top.filter(function (p) { return (p.exitedRound || 0) === latest; });
      }
      return top.map(function (p) { return p.id; });
    }
    return null;
  }

  function continueAfterReveal(game) {
    if (game.phase !== 'revealed') return { error: 'لا يوجد كشف لعرضه' };
    startPostRound(game);
    return { ok: true };
  }

  /* ===== Loki (pre-round phase) ===== */
  // choose the opponent; the stolen card is random from that opponent's hand.
  // If the stolen card was the opponent's LAST card, they lose and exit immediately.
  function useLoki(game, playerId, targetId) {
    if (game.phase !== 'preRound') return { error: 'مش في وقت مرحلة لوكي' };
    if (game.phaseTurnId !== playerId) return { error: 'ليس دورك' };
    var p = getPlayer(game, playerId);
    if (!p || p.eliminated) return { error: 'لاعب خارج' };
    var lokiIdx = -1;
    for (var i = 0; i < p.hand.length; i++) if (p.hand[i].special === 'steal') { lokiIdx = i; break; }
    if (lokiIdx < 0) return { error: 'مفيش كارت لوكي في ايدك' };
    var target = getPlayer(game, targetId);
    if (!target || target.eliminated) return { error: 'الهدف مش موجود' };
    if (target.id === playerId) return { error: 'مش هتسرق من نفسك' };
    if (isInvisible(game, target.id)) return { error: 'مش هتسرق من ' + target.name + ' — هو مختفي' };
    if (target.hand.length === 0) return { error: 'اللاعب مفيش معاه كروت' };
    game.discard.push(p.hand.splice(lokiIdx, 1)[0]);
    var ci = randInt(0, target.hand.length - 1);
    var stolen = target.hand.splice(ci, 1)[0];
    p.hand.push(stolen);
    var eliminated = false;
    if (target.hand.length === 0) {
      eliminated = true;
      eliminatePlayer(game, target.id);
    }
    if (game.phase !== 'ended') advancePhaseTurn(game);
    return { ok: true, stolenId: stolen.id, stolenName: stolen.name, targetId: target.id, eliminated: eliminated };
  }

  /* ===== Two-Face (pre-round phase) ===== */
  // Burns the Two-Face card into the discard and draws 2 extra cards this round
  // (on top of the usual 1-per-round draw). The discard reshuffles back into the
  // deck randomly when the deck runs out, so Two-Face can come back later.
  function useTwoFace(game, playerId) {
    if (game.phase !== 'preRound') return { error: 'مش في وقت مرحلة قبل الراوند' };
    if (game.phaseTurnId !== playerId) return { error: 'ليس دورك' };
    var p = getPlayer(game, playerId);
    if (!p || p.eliminated) return { error: 'لاعب خارج' };
    var tfIdx = -1;
    for (var i = 0; i < p.hand.length; i++) if (p.hand[i].special === 'twoface') { tfIdx = i; break; }
    if (tfIdx < 0) return { error: 'مفيش كارت توو فيس في ايدك' };
    game.discard.push(p.hand.splice(tfIdx, 1)[0]); // card burns into discard
    var drawn = [];
    for (var d = 0; d < 2; d++) {
      var c = drawCard(game, p);
      if (c) drawn.push(c);
    }
    if (game.phase !== 'ended') advancePhaseTurn(game);
    return { ok: true, drawn: drawn.map(function (c) { return c.name; }) };
  }

  /* ===== Hela (pre-round phase) ===== */
  // Pick a target: a RANDOM card from their hand is destroyed (goes to the
  // discard pile), and the Hela card itself is discarded too. No stealing.
  function useHela(game, playerId, targetId) {
    if (game.phase !== 'preRound') return { error: 'مش في وقت مرحلة قبل الراوند' };
    if (game.phaseTurnId !== playerId) return { error: 'ليس دورك' };
    var p = getPlayer(game, playerId);
    if (!p || p.eliminated) return { error: 'لاعب خارج' };
    var helaIdx = -1;
    for (var i = 0; i < p.hand.length; i++) if (p.hand[i].special === 'hela') { helaIdx = i; break; }
    if (helaIdx < 0) return { error: 'مفيش كارت هيلا في ايدك' };
    var target = getPlayer(game, targetId);
    if (!target || target.eliminated) return { error: 'الهدف مش موجود' };
    if (target.id === playerId) return { error: 'مش هتقتل لنفسك' };
    if (isInvisible(game, target.id)) return { error: 'مش هتقتل كارت عند ' + target.name + ' — هو مختفي' };
    if (target.hand.length === 0) return { error: 'اللاعب مفيش معاه كروت' };
    game.discard.push(p.hand.splice(helaIdx, 1)[0]); // Hela burns into discard
    var ci = randInt(0, target.hand.length - 1);
    var destroyed = target.hand.splice(ci, 1)[0];
    game.discard.push(destroyed); // the victim's card goes to the discard too
    var eliminated = false;
    if (target.hand.length === 0) {
      eliminated = true;
      eliminatePlayer(game, target.id);
    }
    if (game.phase !== 'ended') advancePhaseTurn(game);
    return { ok: true, discardedId: destroyed.id, discardedName: destroyed.name, targetId: target.id, eliminated: eliminated };
  }

  /* ===== Kilgrave (pre-round phase) ===== */
  // Only usable by the player who will CHOOSE the round type. Pick a CHARACTER
  // card blindly from a target's hand: that target is then forced to play it
  // during the round (they may add more cards, but can't swap it out).
  function useKilgrave(game, playerId, targetId, cardId) {
    if (game.phase !== 'preRound') return { error: 'مش في وقت مرحلة قبل الراوند' };
    if (game.phaseTurnId !== playerId) return { error: 'ليس دورك' };
    var p = getPlayer(game, playerId);
    if (!p || p.eliminated) return { error: 'لاعب خارج' };
    if (currentChooser(game) === playerId) return { error: 'Kilgrave بيشتغل بس لما تكون انت مش اللي بتحدد نوع الراوند' };
    if (game.kilgraveUsed) return { error: 'Kilgrave اتستخدم في الجولة دي بالفعل' };
    var kgIdx = -1;
    for (var i = 0; i < p.hand.length; i++) if (p.hand[i].special === 'kilgrave') { kgIdx = i; break; }
    if (kgIdx < 0) return { error: 'مفيش كارت Kilgrave في ايدك' };
    var target = getPlayer(game, targetId);
    if (!target || target.eliminated) return { error: 'الهدف مش موجود' };
    if (target.id === playerId) return { error: 'مش هتتحكم في نفسك' };
    if (isInvisible(game, target.id)) return { error: 'مش هتتحكم في ' + target.name + ' — هو مختفي' };
    var forcedCard = null;
    for (var h = 0; h < target.hand.length; h++) {
      if (target.hand[h].id === cardId) { forcedCard = target.hand[h]; break; }
    }
    if (!forcedCard) return { error: 'الكارت مش في ايد الهدف' };
    if (!isRoundPlayable(forcedCard)) return { error: 'الهدف لازم كارت شخصية' };
    game.forcedPlays.push({ playerId: target.id, cardId: forcedCard.id, by: playerId });
    game.kilgraveUsed = true;
    game.discard.push(p.hand.splice(kgIdx, 1)[0]); // Kilgrave burns into discard
    if (game.phase !== 'ended') advancePhaseTurn(game);
    return { ok: true, targetId: target.id, forcedId: forcedCard.id };
  }

  // Character cards of a target that Kilgrave could force (ids only — the user
  // picks blindly without seeing which card is which).
  function kilgraveOptions(game, targetId) {
    var target = getPlayer(game, targetId);
    if (!target || target.eliminated) return { error: 'الهدف مش موجود' };
    var chars = target.hand.filter(function (c) { return isRoundPlayable(c); });
    return { ok: true, targetId: targetId, cardIds: chars.map(function (c) { return c.id; }) };
  }

  /* ===== Riddler (pre-round phase) ===== */
  // Burn the Riddler card to peek at ONE random card from EVERY opponent's hand
  // (full card: name, stats, image). The cards stay in their hands.
  function useRiddler(game, playerId) {
    if (game.phase !== 'preRound') return { error: 'مش في وقت مرحلة قبل الراوند' };
    if (game.phaseTurnId !== playerId) return { error: 'ليس دورك' };
    var p = getPlayer(game, playerId);
    if (!p || p.eliminated) return { error: 'لاعب خارج' };
    var rdIdx = -1;
    for (var i = 0; i < p.hand.length; i++) if (p.hand[i].special === 'riddler') { rdIdx = i; break; }
    if (rdIdx < 0) return { error: 'مفيش كارت Riddler في ايدك' };
    game.discard.push(p.hand.splice(rdIdx, 1)[0]); // Riddler burns into discard
    var peeks = [];
    var actives = activePlayers(game);
    for (var a = 0; a < actives.length; a++) {
      var opp = actives[a];
      if (opp.id === playerId) continue;
      if (isInvisible(game, opp.id)) continue; // can't peek at an invisible player
      if (!opp.hand.length) continue;
      var ci = randInt(0, opp.hand.length - 1);
      peeks.push({ playerId: opp.id, name: opp.name, card: opp.hand[ci] });
    }
    if (game.phase !== 'ended') advancePhaseTurn(game);
    return { ok: true, peeks: peeks };
  }

  /* ===== Mr. Freeze (pre-round phase) ===== */
  // Pick a CHARACTER card blindly from a target's hand: it's FROZEN for 2 rounds.
  // The owner can't play it at all while frozen; if it's their only playable card,
  // their turn is auto-skipped until they have another card. Mr. Freeze burns.
  function useMrFreeze(game, playerId, targetId, cardId) {
    if (game.phase !== 'preRound') return { error: 'مش في وقت مرحلة قبل الراوند' };
    if (game.phaseTurnId !== playerId) return { error: 'ليس دورك' };
    var p = getPlayer(game, playerId);
    if (!p || p.eliminated) return { error: 'لاعب خارج' };
    var mfIdx = -1;
    for (var i = 0; i < p.hand.length; i++) if (p.hand[i].special === 'mrfreeze') { mfIdx = i; break; }
    if (mfIdx < 0) return { error: 'مفيش كارت Mr. Freeze في ايدك' };
    var target = getPlayer(game, targetId);
    if (!target || target.eliminated) return { error: 'الهدف مش موجود' };
    if (target.id === playerId) return { error: 'مش هتجمد لنفسك' };
    if (isInvisible(game, target.id)) return { error: 'مش هتجمد كارت عند ' + target.name + ' — هو مختفي' };
    if (isFrozen(game, target.id, cardId)) return { error: 'الكارت دا متجمد أصلًا' };
    var frozenCard = null;
    for (var h = 0; h < target.hand.length; h++) {
      if (target.hand[h].id === cardId) { frozenCard = target.hand[h]; break; }
    }
    if (!frozenCard) return { error: 'الكارت مش في ايد الهدف' };
    if (!isRoundPlayable(frozenCard)) return { error: 'الهدف لازم كارت شخصية' };
    game.frozenCards.push({ playerId: target.id, cardId: frozenCard.id, untilRound: game.round + 2 });
    game.discard.push(p.hand.splice(mfIdx, 1)[0]); // Mr. Freeze burns into discard
    if (game.phase !== 'ended') advancePhaseTurn(game);
    return { ok: true, targetId: target.id, frozenId: frozenCard.id };
  }

  /* ===== Translucent (pre-round phase) ===== */
  // Turn invisible for THIS round and the next: while invisible, no other player
  // can target you with any card effect (Loki steal, Hela destroy, Kilgrave
  // control, Riddler peek, Mr. Freeze freeze, Black Noir swap). Translucent burns.
  function useTranslucent(game, playerId) {
    if (game.phase !== 'preRound') return { error: 'مش في وقت مرحلة قبل الراوند' };
    if (game.phaseTurnId !== playerId) return { error: 'ليس دورك' };
    var p = getPlayer(game, playerId);
    if (!p || p.eliminated) return { error: 'لاعب خارج' };
    var trIdx = -1;
    for (var i = 0; i < p.hand.length; i++) if (p.hand[i].special === 'translucent') { trIdx = i; break; }
    if (trIdx < 0) return { error: 'مفيش كارت Translucent في ايدك' };
    if (isInvisible(game, playerId)) return { error: 'انت مختفي أصلًا' };
    game.invisible.push({ playerId: playerId, untilRound: game.round + 1 });
    game.discard.push(p.hand.splice(trIdx, 1)[0]); // Translucent burns into discard
    if (game.phase !== 'ended') advancePhaseTurn(game);
    return { ok: true, untilRound: game.round + 1 };
  }

  /* ===== Reverse Flash (post-round phase) ===== */
  // Only usable by players who LOST the round. Save one of your played cards
  // back to hand, and discard a CHARACTER card from hand in its place.
  function useReverseFlash(game, playerId, playedCardId, handCardId) {
    if (game.phase !== 'postRound') return { error: 'مش في وقت مرحلة ريفرس فلاش' };
    if (game.phaseTurnId !== playerId) return { error: 'ليس دورك' };
    var p = getPlayer(game, playerId);
    if (!p || p.eliminated) return { error: 'لاعب خارج' };
    var reveal = game.revealInfo;
    if (!reveal) return { error: 'لا يوجد راوند' };
    if (reveal.winners.indexOf(playerId) >= 0) return { error: 'انت كسبت الراوند — مفيش إنقاذ' };
    var rfIdx = -1;
    for (var i = 0; i < p.hand.length; i++) if (p.hand[i].special === 'swap') { rfIdx = i; break; }
    if (rfIdx < 0) return { error: 'مفيش كارت ريفرس فلاش في ايدك' };
    var myPlay = null;
    for (var j = 0; j < reveal.plays.length; j++) if (reveal.plays[j].playerId === playerId) { myPlay = reveal.plays[j]; break; }
    if (!myPlay) return { error: 'انت مالعبتش في الجولة' };
    var playedCard = null;
    for (var k = 0; k < myPlay.cards.length; k++) if (myPlay.cards[k].id === playedCardId) { playedCard = myPlay.cards[k]; break; }
    if (!playedCard) return { error: 'الكارت دا مش من كروت راوندك' };
    var handIdx = -1;
    for (var h = 0; h < p.hand.length; h++) if (p.hand[h].id === handCardId) { handIdx = h; break; }
    if (handIdx < 0) return { error: 'كارت غير موجود في ايدك' };
    var handCard = p.hand[handIdx];
    if (handCard.bonus) return { error: 'لازم ترمي كارت شخصية مش كارت +' };
    if (handCard.special) return { error: 'لازم ترمي كارت شخصية مش كارت خاص' };
    var rfCard = p.hand[rfIdx];
    game.discard.push(rfCard, handCard);
    p.hand = p.hand.filter(function (c) { return c !== rfCard && c !== handCard; });
    p.hand.push(playedCard);
    // the saved card was already pushed to the discard pile in finalizeRound: pull it back
    for (var d = 0; d < game.discard.length; d++) {
      if (game.discard[d].id === playedCard.id) { game.discard.splice(d, 1); break; }
    }
    advancePhaseTurn(game);
    return { ok: true, savedId: playedCard.id, discardedId: handCard.id };
  }

  function eliminatePlayer(game, id) {
    var p = getPlayer(game, id);
    if (!p || p.eliminated) return;
    if (p.lastPlay && p.lastPlay.cards) {
      game.discard = game.discard.concat(p.lastPlay.cards);
      p.lastPlay = null;
    }
    p.eliminated = true;
    p.exitedRound = p.exitedRound == null ? game.round : p.exitedRound;
    p.hand = [];
    game.invisible = game.invisible.filter(function (f) { return f.playerId !== id; });
    var actives = activePlayers(game);
    if (actives.length === 0) {
      game.phase = 'ended';
      game.winnerIds = [];
    } else if (actives.length === 1) {
      game.phase = 'ended';
      game.winnerIds = [actives[0].id];
    } else if ((game.phase === 'preRound' || game.phase === 'postRound') && game.phaseTurnId === id) {
      advancePhaseTurn(game);
    } else if (game.phase === 'preRound' || game.phase === 'postRound') {
      // someone who already acted this phase (or is still queued) was removed
      var qIdx = game.phaseQueue.indexOf(id);
      if (qIdx >= 0) game.phaseQueue.splice(qIdx, 1);
    } else if (game.phase === 'chooseType' && game.chooserId === id) {
      var order = activeOrder(game);
      if (order.length) {
        game.chooserId = order[(game.startIndex + (game.round - 1)) % order.length];
        game.currentPlayerId = game.chooserId;
      }
    } else if (game.phase === 'playing') {
      advancePlayTurn(game);
    }
  }

  function snapshot(game, viewerId) {
    return {
      round: game.round,
      winPoints: game.cfg.winPoints,
      phase: game.phase,
      roundType: game.roundType,
      phaseTurnId: game.phaseTurnId,
      turnDeadline: game.turnDeadline,
      chooserId: game.phase === 'preRound' ? currentChooser(game) : game.chooserId,
      currentPlayerId: game.currentPlayerId,
      kilgraveUsed: game.kilgraveUsed,
      revealInfo: game.revealInfo,
      winnerIds: game.winnerIds,
      deckCount: game.deck.length,
      discardCount: game.discard.length,
      players: game.players.map(function (p) {
        var isViewer = p.id === viewerId;
        // opponents' card counts stay hidden while a round runs (except pre-round,
        // when everyone can see how many cards each player holds for Loki decisions)
        var hideCount = !isViewer && (game.phase === 'chooseType' || game.phase === 'playing' ||
          game.phase === 'postRound');
        // hide play count during playing phase so opponents can't see how many cards were played
        var hidePlayCount = !isViewer && game.phase === 'playing';
        var out = {
          id: p.id,
          name: p.name,
          isAI: p.isAI,
          seat: p.seat,
          avatar: p.avatar || '',
          points: p.points,
          eliminated: p.eliminated,
          handCount: hideCount ? null : p.hand.length,
          playCount: hidePlayCount ? 0 : (p.lastPlay ? p.lastPlay.count : 0),
          playedCards: null,
          total: p.lastPlay ? p.lastPlay.total : null,
          invisible: isInvisible(game, p.id)
        };
        if (isViewer && p.hand) {
          var forcedId = null;
          for (var fv = 0; fv < game.forcedPlays.length; fv++) {
            if (game.forcedPlays[fv].playerId === p.id) { forcedId = game.forcedPlays[fv].cardId; break; }
          }
          out.hand = p.hand.map(function (c) {
            var cp = {
              id: c.id, name: c.name, img: c.img, rarity: c.rarity, specialty: c.specialty,
              attack: c.attack, intelligence: c.intelligence, defense: c.defense,
              special: c.special, bonus: c.bonus
            };
            if (forcedId && c.id === forcedId) cp.forced = true;
            if (isFrozen(game, p.id, c.id)) cp.frozen = true;
            return cp;
          });
        }
        if (p.lastPlay && (p.lastPlay.total !== null || isViewer)) {
          out.playedCards = p.lastPlay.cards.map(function (c) { return c; });
        }
        return out;
      })
    };
  }

  function serialize(game, viewerId) {
    return snapshot(game, viewerId);
  }

  return {
    STATS: STATS,
    STAT_LABELS: STAT_LABELS,
    HAND_SIZE: HAND_SIZE,
    PHASE_TURN_MS: PHASE_TURN_MS,
    createCard: createCard,
    createDeck: createDeck,
    createGame: createGame,
    getPlayer: getPlayer,
    activePlayers: activePlayers,
    activeOrder: activeOrder,
    isRoundPlayable: isRoundPlayable,
    canPlayCharacter: canPlayCharacter,
    canAct: canAct,
    chooseRoundType: chooseRoundType,
    playCards: playCards,
    useLoki: useLoki,
    useTwoFace: useTwoFace,
    useHela: useHela,
    useKilgrave: useKilgrave,
    kilgraveOptions: kilgraveOptions,
    useRiddler: useRiddler,
    useMrFreeze: useMrFreeze,
    isFrozen: isFrozen,
    useTranslucent: useTranslucent,
    isInvisible: isInvisible,
    currentChooser: currentChooser,
    useReverseFlash: useReverseFlash,
    skipPhaseTurn: skipPhaseTurn,
    continueAfterReveal: continueAfterReveal,
    eliminatePlayer: eliminatePlayer,
    snapshot: snapshot,
    serialize: serialize,
    cardValue: cardValue,
    randInt: randInt,
    shuffle: shuffle
  };
});
