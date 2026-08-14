/* AI logic for Multiverse — runs on the client for the "vs AI" mode.
   Every AI plays its OWN game: it never mirrors what the human (or anyone)
   already threw this round. It decides how many cards to commit based on its
   own hand, its own estimate of the round, and its personality. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.AiLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PROFILES = [
    { name: 'عدواني', reserve: 0, aggression: 1.22, bluff: 0.06, pref: 'attack' },
    { name: 'حذر', reserve: 2, aggression: 0.84, bluff: 0.26, pref: 'defense' },
    { name: 'مخادع', reserve: 1, aggression: 1.02, bluff: 0.40, pref: 'intelligence' },
    { name: 'متوازن', reserve: 1, aggression: 1.00, bluff: 0.12, pref: null },
    { name: 'مقامر', reserve: 0, aggression: 1.35, bluff: 0.10, pref: null },
    { name: 'سلحفاة', reserve: 3, aggression: 0.72, bluff: 0.18, pref: null }
  ];

  function valueOf(card, stat) {
    if (card.bonus) return card.bonus;
    return (card[stat] || 0) + (card.bonus || 0);
  }

  function hasLoki(player) {
    for (var i = 0; i < player.hand.length; i++) if (player.hand[i].special === 'steal') return true;
    return false;
  }

  function hasReverseFlash(player) {
    for (var i = 0; i < player.hand.length; i++) if (player.hand[i].special === 'swap') return true;
    return false;
  }

  function hasTwoFace(player) {
    for (var i = 0; i < player.hand.length; i++) if (player.hand[i].special === 'twoface') return true;
    return false;
  }

  function hasHela(player) {
    for (var i = 0; i < player.hand.length; i++) if (player.hand[i].special === 'hela') return true;
    return false;
  }

  function hasKilgrave(player) {
    for (var i = 0; i < player.hand.length; i++) if (player.hand[i].special === 'kilgrave') return true;
    return false;
  }

  function hasRiddler(player) {
    for (var i = 0; i < player.hand.length; i++) if (player.hand[i].special === 'riddler') return true;
    return false;
  }

  function hasMrFreeze(player) {
    for (var i = 0; i < player.hand.length; i++) if (player.hand[i].special === 'mrfreeze') return true;
    return false;
  }

  function hasTranslucent(player) {
    for (var i = 0; i < player.hand.length; i++) if (player.hand[i].special === 'translucent') return true;
    return false;
  }

  // stable personality per AI (ai0 -> عدواني, ai1 -> حذر, ai2 -> مخادع, ...)
  function profileOf(player) {
    var id = String(player ? player.id : '');
    var m = id.match(/(\d+)$/);
    var idx = m ? parseInt(m[1], 10) : id.length;
    return PROFILES[idx % PROFILES.length];
  }

  function pickStat(game, player) {
    var prof = profileOf(player);
    if (prof.pref && Math.random() < 0.55) return prof.pref;
    // only characters help decide the stat (specials/bonuses play elsewhere)
    var chars = player.hand.filter(function (c) { return !c.special && !c.bonus; });
    if (!chars.length) return Multiverse.STATS[Math.floor(Math.random() * 3)];
    var sums = Multiverse.STATS.map(function (s) {
      var total = 0;
      for (var i = 0; i < chars.length; i++) total += valueOf(chars[i], s);
      return { stat: s, sum: total };
    });
    sums.sort(function (a, b) { return b.sum - a.sum; });
    var r = Math.random();
    if (r < 0.7) return sums[0].stat;
    if (r < 0.92) return sums[1].stat;
    return sums[2].stat;
  }

  function pickCards(game, player) {
    var prof = profileOf(player);
    var stat = game.roundType;
    // Black Noir special play: swap scores with this round's chooser (must play a
    // second card — gift them our weakest, take their points). Can't be used if
    // the chooser is invisible (Translucent).
    if (game.chooserId && game.chooserId !== player.id && !Multiverse.isInvisible(game, game.chooserId)) {
      var bnCard = null;
      for (var bn = 0; bn < player.hand.length; bn++) {
        if (player.hand[bn].special === 'blacknoir') { bnCard = player.hand[bn]; break; }
      }
      if (bnCard) {
        var chars = player.hand.filter(function (c) { return !c.special && !c.bonus; });
        if (chars.length) {
          var worst = chars[0];
          for (var w = 1; w < chars.length; w++) {
            if (valueOf(chars[w], stat) < valueOf(worst, stat)) worst = chars[w];
          }
          var bnChance = 0.3 + prof.aggression * 0.15;
          if (player.points >= game.cfg.winPoints - 2) bnChance += 0.15;
          if (Math.random() < bnChance) return [bnCard.id, worst.id];
        }
      }
    }
    // Loki / Reverse Flash can't be played during a round; frozen cards neither
    var sorted = player.hand.filter(function (c) {
      return !c.special && !(game.frozenCards && game.frozenCards.some(function (f) {
        return f.playerId === player.id && f.cardId === c.id;
      }));
    })
      .slice().sort(function (a, b) { return valueOf(b, stat) - valueOf(a, stat); });
    var round = game.round;

    // personal reserve: how many cards we keep for later.
    var safeKeep;
    if (sorted.length > 2) {
      safeKeep = Math.min(Math.max(2, prof.reserve), sorted.length - 1);
    } else if (sorted.length > 1) {
      safeKeep = 1;
    } else {
      safeKeep = 0; // forced to play the single last card
    }
    var spendCap = Math.max(1, sorted.length - safeKeep);

    // early game: usually play it safe, but sometimes still get reckless (random)
    if (round <= 2) {
      if (Math.random() < 0.75) spendCap = Math.min(spendCap, 2);
    } else if (round <= 4) {
      if (Math.random() < 0.6) spendCap = Math.min(spendCap, 3);
    }

    // Estimate how big the opponents' bets will be — our OWN read based on the
    // game state (players left, how late it is), NOT on what anyone already threw.
    var actives = Multiverse.activePlayers(game);
    var oppCountGuess = 2 + (round >= 5 ? 1 : 0) + (actives.length > 2 ? 1 : 0);

    var avgVal = 400;
    if (sorted.length) {
      var statSum = 0;
      for (var av = 0; av < sorted.length; av++) statSum += valueOf(sorted[av], stat);
      avgVal = statSum / sorted.length;
    }
    var target = oppCountGuess * avgVal * 0.9 + Math.random() * avgVal * 0.35;
    target *= (0.85 + prof.aggression * 0.2); // personality scaling

    var needPoint = player.points === game.cfg.winPoints - 1;

    // THE ONLY all-in: a player one point away from 7 whose whole hand beats
    // the estimate by a wide margin (i.e. a confident win).
    var allInTotal = 0;
    for (var a = 0; a < sorted.length; a++) allInTotal += valueOf(sorted[a], stat);
    if (needPoint && allInTotal >= target * 1.3) {
      return sorted.map(function (c) { return c.id; });
    }

    // minimum number of top cards needed to beat the estimated target
    var need = 0, cum = 0;
    for (var k = 0; k < sorted.length; k++) {
      cum += valueOf(sorted[k], stat);
      if (cum >= target) { need = k + 1; break; }
    }

    var take = 0;
    if (need > 0 && need <= spendCap) {
      // commit just enough to beat the estimate
      take = need;
      if (Math.random() < prof.bluff && take > 1) take = take - 1;  // pretend to have less
      if (take < spendCap && Math.random() < (prof.aggression - 0.9) * 0.8) take = take + 1; // push
    } else {
      // cannot win within budget: aggressive AIs bluff 2, others toss 1
      if (prof.aggression > 1.05 && sorted.length > 2 && Math.random() < 0.35) {
        take = 2;
      } else {
        take = 1;
      }
    }
    take = Math.max(1, Math.min(take, spendCap));
    var chosen = sorted.slice(0, take);
    // bonus cards can't be played alone: always include a character card
    var hasChar = false;
    for (var cc = 0; cc < chosen.length; cc++) if (!chosen[cc].bonus) hasChar = true;
    if (!hasChar) {
      for (var cf = 0; cf < sorted.length; cf++) {
        if (!sorted[cf].bonus) { chosen[chosen.length - 1] = sorted[cf]; hasChar = true; break; }
      }
    }
    var ids = [];
    for (var id = 0; id < chosen.length; id++) ids.push(chosen[id].id);

    // Kilgrave: if we're being forced to play a specific card, it must be in the play
    var forcedId = null;
    if (game.forcedPlays) {
      for (var fp = 0; fp < game.forcedPlays.length; fp++) {
        if (game.forcedPlays[fp].playerId === player.id) { forcedId = game.forcedPlays[fp].cardId; break; }
      }
    }
    if (forcedId && ids.indexOf(forcedId) < 0) ids.push(forcedId);
    return ids;
  }

  // Pre-round: decide whether to mind-control a target with Kilgrave.
  // Only valid when THIS player is the one who will choose the round type.
  function pickKilgrave(game, player) {
    if (!hasKilgrave(player)) return { use: false };
    if (Multiverse.currentChooser(game) === player.id) return { use: false };
    var targets = game.players.filter(function (p) {
      if (p.id === player.id || p.eliminated) return false;
      if (Multiverse.isInvisible(game, p.id)) return false;
      for (var i = 0; i < p.hand.length; i++) if (!p.hand[i].special && !p.hand[i].bonus) return true;
      return false;
    });
    if (!targets.length) return { use: false };

    var target = targets[0];
    for (var t = 1; t < targets.length; t++) {
      if (targets[t].points > target.points) target = targets[t];
      else if (targets[t].points === target.points && targets[t].hand.length > target.hand.length) target = targets[t];
    }
    // blind pick: a random character card from the target
    var chars = target.hand.filter(function (c) { return !c.special && !c.bonus; });
    var cardId = chars[Math.floor(Math.random() * chars.length)].id;

    var prof = profileOf(player);
    var chance = 0.4 + prof.aggression * 0.15;
    if (player.points >= game.cfg.winPoints - 2) chance += 0.2;
    if (target.points >= game.cfg.winPoints - 2) chance += 0.2;
    if (Math.random() < chance) return { use: true, targetId: target.id, cardId: cardId };
    return { use: false };
  }

  // Pre-round: decide whether to use a Loki card and from whom.
  function pickLoki(game, player) {
    if (!hasLoki(player)) return { use: false };
    var targets = game.players.filter(function (p) {
      return p.id !== player.id && !p.eliminated && p.hand.length > 0 && !Multiverse.isInvisible(game, p.id);
    });
    if (!targets.length) return { use: false };

    // priority 1: target players with 1-2 cards (try to eliminate them)
    var weakTargets = targets.filter(function (p) { return p.hand.length <= 2; });
    var target;

    if (weakTargets.length) {
      // pick the weakest target (least cards, then least points)
      target = weakTargets[0];
      for (var i = 1; i < weakTargets.length; i++) {
        if (weakTargets[i].hand.length < target.hand.length) {
          target = weakTargets[i];
        } else if (weakTargets[i].hand.length === target.hand.length && weakTargets[i].points < target.points) {
          target = weakTargets[i];
        }
      }
    } else {
      // priority 2: target the player with most points (winning)
      target = targets[0];
      for (var j = 1; j < targets.length; j++) {
        if (targets[j].points > target.points) {
          target = targets[j];
        } else if (targets[j].points === target.points && targets[j].hand.length > target.hand.length) {
          target = targets[j];
        }
      }
    }

    var prof = profileOf(player);
    var chance = 0.4 + prof.aggression * 0.15;

    // more likely to use when close to winning
    if (player.points >= game.cfg.winPoints - 2) chance += 0.2;

    // more likely to use if target has many cards
    if (target.hand.length >= 4) chance += 0.15;

    // more likely to use if target is winning
    if (target.points >= game.cfg.winPoints - 2) chance += 0.1;

    // much more likely to use if target has 1-2 cards (try to eliminate)
    if (target.hand.length <= 2) chance += 0.35;

    if (Math.random() < chance) return { use: true, targetId: target.id };
    return { use: false };
  }

  // Pre-round: decide whether to burn a Hela to destroy a random card from a
  // chosen opponent's hand (both the victim's card and Hela go to the discard).
  function pickHela(game, player) {
    if (!hasHela(player)) return { use: false };
    var targets = game.players.filter(function (p) {
      return p.id !== player.id && !p.eliminated && p.hand.length > 0 && !Multiverse.isInvisible(game, p.id);
    });
    if (!targets.length) return { use: false };

    var target = targets[0];
    for (var i = 1; i < targets.length; i++) {
      if (targets[i].hand.length > target.hand.length) {
        target = targets[i];
      } else if (targets[i].hand.length === target.hand.length && targets[i].points > target.points) {
        target = targets[i];
      }
    }

    var prof = profileOf(player);
    var chance = 0.35 + prof.aggression * 0.15;
    if (player.points >= game.cfg.winPoints - 2) chance += 0.2;
    if (target.hand.length >= 4) chance += 0.2;
    if (target.hand.length <= 2) chance += 0.3; // chance to eliminate
    if (Math.random() < chance) return { use: true, targetId: target.id };
    return { use: false };
  }

  // Pre-round: decide whether to freeze a target's card for 2 rounds with Mr. Freeze.
  function pickMrFreeze(game, player) {
    if (!hasMrFreeze(player)) return { use: false };
    var targets = game.players.filter(function (p) {
      if (p.id === player.id || p.eliminated) return false;
      if (Multiverse.isInvisible(game, p.id)) return false;
      for (var i = 0; i < p.hand.length; i++) {
        var c = p.hand[i];
        if (!c.special && !c.bonus && !Multiverse.isFrozen(game, p.id, c.id)) return true;
      }
      return false;
    });
    if (!targets.length) return { use: false };

    var target = targets[0];
    for (var t = 1; t < targets.length; t++) {
      if (targets[t].points > target.points) target = targets[t];
      else if (targets[t].points === target.points && targets[t].hand.length < target.hand.length) target = targets[t];
    }
    // freeze the strongest-looking character card (blind pick)
    var chars = target.hand.filter(function (c) {
      return !c.special && !c.bonus && !Multiverse.isFrozen(game, target.id, c.id);
    });
    var best = chars[0];
    for (var b = 1; b < chars.length; b++) {
      var bv = Math.max(best.attack, best.intelligence, best.defense);
      var cv = Math.max(chars[b].attack, chars[b].intelligence, chars[b].defense);
      if (cv > bv) best = chars[b];
    }

    var prof = profileOf(player);
    var chance = 0.4 + prof.aggression * 0.15;
    if (player.points >= game.cfg.winPoints - 2) chance += 0.2;
    if (target.points >= game.cfg.winPoints - 2) chance += 0.2;
    if (target.hand.length <= 2) chance += 0.15; // might leave them with nothing to play
    if (Math.random() < chance) return { use: true, targetId: target.id, cardId: best.id };
    return { use: false };
  }

  // Pre-round: decide whether to peek at every opponent's hand with Riddler.
  function pickRiddler(game, player) {
    if (!hasRiddler(player)) return { use: false };
    var prof = profileOf(player);
    var chance = 0.35 + prof.aggression * 0.12;
    if (player.points >= game.cfg.winPoints - 2) chance += 0.15;
    if (Math.random() < chance) return { use: true };
    return { use: false };
  }

  // Pre-round: decide whether to burn a Two-Face for 2 extra draws.
  function pickTwoFace(game, player) {
    if (!hasTwoFace(player)) return { use: false };
    var prof = profileOf(player);
    var chance = 0.45;
    // bigger benefit when the hand is getting empty
    if (player.hand.length <= 4) chance += 0.25;
    else if (player.hand.length <= 6) chance += 0.1;
    // endgame push
    if (player.points >= game.cfg.winPoints - 2) chance += 0.2;
    // cautious AIs hold it longer
    chance *= 0.7 + prof.aggression * 0.25;
    if (Math.random() < chance) return { use: true };
    return { use: false };
  }

  // Pre-round: decide whether to turn invisible for 2 rounds with Translucent.
  function pickTranslucent(game, player) {
    if (!hasTranslucent(player)) return { use: false };
    if (Multiverse.isInvisible(game, player.id)) return { use: false };
    var prof = profileOf(player);
    var chance = 0.35 + prof.aggression * 0.12;
    // more likely when an opponent holds a targeting special (Loki/Hela/Kilgrave/
    // Mr. Freeze/Black Noir) or when we're close to winning
    var danger = false;
    for (var i = 0; i < game.players.length; i++) {
      var o = game.players[i];
      if (o.id === player.id || o.eliminated) continue;
      for (var j = 0; j < o.hand.length; j++) {
        var sp = o.hand[j].special;
        if (sp === 'steal' || sp === 'hela' || sp === 'kilgrave' || sp === 'mrfreeze' || sp === 'blacknoir') { danger = true; break; }
      }
      if (danger) break;
    }
    if (danger) chance += 0.3;
    if (player.points >= game.cfg.winPoints - 2) chance += 0.2;
    if (game.round <= 3) chance += 0.1;
    if (Math.random() < chance) return { use: true };
    return { use: false };
  }

  // Post-round: decide whether to save a card with Reverse Flash.
  function pickReverseFlash(game, player) {
    if (!hasReverseFlash(player)) return { use: false };
    var reveal = game.revealInfo;
    if (!reveal) return { use: false };
    if (reveal.winners.indexOf(player.id) >= 0) return { use: false }; // must have lost

    var myPlay = null;
    for (var i = 0; i < reveal.plays.length; i++) {
      if (reveal.plays[i].playerId === player.id) { myPlay = reveal.plays[i]; break; }
    }
    if (!myPlay || !myPlay.cards.length) return { use: false };

    var stat = game.roundType;

    // find the best card we lost (the one worth saving)
    var bestSave = null, bestVal = -1;
    for (var j = 0; j < myPlay.cards.length; j++) {
      if (myPlay.cards[j].special) continue;
      var v = valueOf(myPlay.cards[j], stat);
      if (v > bestVal) { bestVal = v; bestSave = myPlay.cards[j]; }
    }
    if (!bestSave) return { use: false };

    // calculate average value of cards in hand
    var handChars = player.hand.filter(function (c) { return !c.bonus && !c.special; });
    if (!handChars.length) return { use: false };

    var handAvg = 0;
    for (var h = 0; h < handChars.length; h++) handAvg += valueOf(handChars[h], stat);
    handAvg = handAvg / handChars.length;

    // find worst card in hand to discard
    var worstDiscard = handChars[0];
    for (var w = 1; w < handChars.length; w++) {
      if (valueOf(handChars[w], stat) < valueOf(worstDiscard, stat)) worstDiscard = handChars[w];
    }

    // logic: use RF only if:
    // 1. the saved card is above average (important card)
    // 2. the saved card is better than what we discard
    var savedAboveAvg = bestVal > handAvg;
    var savedBetterThanDiscard = bestVal > valueOf(worstDiscard, stat);

    // higher chance if the card is very valuable
    var prof = profileOf(player);
    var chance = 0.3;
    if (savedAboveAvg) chance += 0.3;
    if (savedBetterThanDiscard) chance += 0.2;
    if (player.points >= game.cfg.winPoints - 2) chance += 0.15;

    if (Math.random() < chance && savedBetterThanDiscard) {
      return { use: true, playedCardId: bestSave.id, handCardId: worstDiscard.id };
    }
    return { use: false };
  }

  return {
    pickStat: pickStat,
    pickCards: pickCards,
    pickLoki: pickLoki,
    pickHela: pickHela,
    pickKilgrave: pickKilgrave,
    pickMrFreeze: pickMrFreeze,
    pickRiddler: pickRiddler,
    pickTwoFace: pickTwoFace,
    pickReverseFlash: pickReverseFlash,
    pickTranslucent: pickTranslucent,
    hasTranslucent: hasTranslucent,
    profileOf: profileOf,
    PROFILES: PROFILES
  };
});
