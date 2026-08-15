/* Multiverse main controller — screens, AI mode loop, online wiring. */
(function () {
  'use strict';

  function q(id) { return document.getElementById(id); }

  var aiCount = 1;
  var aiGame = null;
  var aiMyId = null;
  var aiTimer = null;
  var countdownTimer = null;

  /* ===== audio ===== */
  var MUTE_SVG = '<svg viewBox="0 0 24 24" class="ic"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16.5 8.5l5 7"/><path d="M21.5 8.5l-5 7"/></svg>';
  var SOUND_SVG = '<svg viewBox="0 0 24 24" class="ic"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16 8c1.5 1.2 2.5 2.9 2.5 4s-1 2.8-2.5 4"/></svg>';
  var MUTE_SVG_SMALL = MUTE_SVG, SOUND_SVG_SMALL = SOUND_SVG;

  function setMuteBtns() {
    var muted = Audio.isMuted();
    var btns = [q('btn-mute-menu'), q('btn-mute-game')];
    btns.forEach(function (b) { if (b) b.innerHTML = muted ? MUTE_SVG : SOUND_SVG; });
  }

  function goMenu() {
    clearTimeout(aiTimer);
    aiTimer = null;
    clearTimeout(countdownTimer);
    countdownTimer = null;
    if (online) { online.connected = false; online.wasOpen = false; }
    p2pMode = null;
    Net.setTransport(null);
    if (typeof P2P !== 'undefined') P2P.close();
    Net.close();
    Render.setOnline(false);
    Render.clearHand();
    Render.hideReveal();
    Render.hideEnd();
    Chat.disable();
    Chat.reset();
    Render.showScreen('menu');
  }

  function startCountdown(snap) {
    clearTimeout(countdownTimer);
    countdownTimer = null;
    if (!snap || !snap.turnDeadline) return;
    function tick() {
      var now = Date.now();
      if (now >= snap.turnDeadline) return;
      var ov = document.getElementById('phase-overlay');
      if (ov && !ov.classList.contains('hidden')) {
        var sub = ov.querySelector('.sub');
        if (sub) {
          var secs = Math.max(0, Math.ceil((snap.turnDeadline - now) / 1000));
          var current = sub.textContent;
          var updated = current.replace(/\(\d+ ث\)/, '(' + secs + ' ث)');
          sub.textContent = updated;
        }
        countdownTimer = setTimeout(tick, 1000);
      }
    }
    countdownTimer = setTimeout(tick, 1000);
  }

  /* ===== AI mode ===== */
  function buildPlayers(humanName, n) {
    var aiNames = ['مصطفى', 'فرفور', 'محمود'];
    var players = [{ id: 'human', name: humanName, isAI: false }];
    for (var i = 0; i < n; i++) players.push({ id: 'ai' + i, name: aiNames[i] || 'AI-' + (i + 1), isAI: true });
    return players;
  }

  function renderLocal() {
    Render.renderGame(Multiverse.snapshot(aiGame, aiMyId), {
      myId: aiMyId, isAiMode: true,
      onType: onTypeLocal, onPlay: onPlayLocal, onContinue: onContinueLocal,
      onLoki: onLokiLocal, onTwoFace: onTwoFaceLocal, onHela: onHelaLocal,
      onKilgrave: onKilgraveLocal, onKilgravePick: onKilgravePickLocal,
      onRiddler: onRiddlerLocal,
      onMrFreeze: onMrFreezeLocal, onMrFreezePick: onMrFreezePickLocal,
      onTranslucent: onTranslucentLocal,
      onSave: onSaveLocal, onSkip: onSkipLocal,
      onRestart: startAiMode, onMenu: goMenu
    });
  }

  function afterLocalChange() {
    renderLocal();
    var snap = Multiverse.snapshot(aiGame, aiMyId);
    // Stay on the reveal screen — let the player click متابعة when ready
    if (snap.phase === 'revealed') {
      clearTimeout(aiTimer);
      aiTimer = null;
      return;
    }
    if (snap.phase === 'ended') return;
    scheduleAi();
  }

  function scheduleAi() {
    clearTimeout(aiTimer);
    var snap = Multiverse.snapshot(aiGame, aiMyId);
    if (snap.phase === 'preRound' && snap.phaseTurnId !== aiMyId) {
      var pre = Multiverse.getPlayer(aiGame, snap.phaseTurnId);
      aiTimer = setTimeout(function () {
        var kg = AiLogic.pickKilgrave(aiGame, pre);
        if (aiGame.kilgraveUsed) kg.use = false; // Kilgrave happens once per round
        var mf = AiLogic.pickMrFreeze(aiGame, pre);
        var tf = AiLogic.pickTwoFace(aiGame, pre);
        var rd = AiLogic.pickRiddler(aiGame, pre);
        var hd = AiLogic.pickHela(aiGame, pre);
        var tr = AiLogic.pickTranslucent(aiGame, pre);
        var loki = null;
        var stole = false;
        var stealTarget = null;
        if (kg.use) {
          var rkg = Multiverse.useKilgrave(aiGame, pre.id, kg.targetId, kg.cardId);
          if (rkg.ok) {
            Audio.kilgrave();
            var kgTarget = Multiverse.getPlayer(aiGame, kg.targetId);
            Render.toast(pre.name + ' استخدم Kilgrave وتحكم في ' + (kgTarget ? kgTarget.name : '؟'));
            Render.reaction(pre.id, 'controller', 0.8);
            Render.reaction(kg.targetId, 'controlled', 0.85);
          } else {
            Multiverse.skipPhaseTurn(aiGame, pre.id);
          }
        } else if (mf.use) {
          var rmf = Multiverse.useMrFreeze(aiGame, pre.id, mf.targetId, mf.cardId);
          if (rmf.ok) {
            Audio.mrFreeze();
            var mfTarget = Multiverse.getPlayer(aiGame, mf.targetId);
            Render.toast(pre.name + ' جمّد كارت عند ' + (mfTarget ? mfTarget.name : '؟') + ' لمدة جولتين');
            Render.reaction(pre.id, 'freezer', 0.8);
            Render.reaction(mf.targetId, 'frozen', 0.85);
          } else {
            Multiverse.skipPhaseTurn(aiGame, pre.id);
          }
        } else if (tf.use) {
          var rtf = Multiverse.useTwoFace(aiGame, pre.id);
          if (rtf.ok) {
            Audio.twoFace();
            Render.toast(pre.name + ' استخدم توو فيس وسحب 2 كروت');
            Render.reaction(pre.id, 'twoface', 0.8);
          }
        } else if (rd.use) {
          var rrd = Multiverse.useRiddler(aiGame, pre.id);
          if (rrd.ok) {
            Audio.riddler();
            Render.toast(pre.name + ' استخدم Riddler وشف كارت من كل لاعب');
            Render.reaction(pre.id, 'inspector', 0.8);
          }
        } else if (hd.use) {
          var rh = Multiverse.useHela(aiGame, pre.id, hd.targetId);
          if (rh.ok) {
            Audio.hela();
            var htarget = Multiverse.getPlayer(aiGame, hd.targetId);
            var htargetName = htarget ? htarget.name : '؟';
            if (hd.targetId === aiMyId) {
              Render.toast(pre.name + ' قتل منك كارت: ' + (rh.discardedName || 'كارت'));
            } else {
              Render.toast(pre.name + ' قتل ' + (rh.discardedName || 'كارت') + ' من ' + htargetName);
            }
            Render.reaction(pre.id, 'destroyer', 0.8);
            Render.reaction(hd.targetId, 'hela_target', 0.85);
            stole = false;
            stealTarget = null;
          }
        } else if (tr.use) {
          var rtr = Multiverse.useTranslucent(aiGame, pre.id);
          if (rtr.ok) {
            Audio.translucent();
            Render.toast(pre.name + ' استخدم Translucent واختفي لمدة جولتين');
            Render.reaction(pre.id, 'phantom', 0.8);
          } else {
            Multiverse.skipPhaseTurn(aiGame, pre.id);
          }
        } else {
          loki = AiLogic.pickLoki(aiGame, pre);
          if (loki.use) {
            var res = Multiverse.useLoki(aiGame, pre.id, loki.targetId);
            if (res.ok) {
              stole = true;
              stealTarget = loki.targetId;
              Audio.steal();
              Render.reaction(pre.id, 'stealer', 0.75);
              var target = Multiverse.getPlayer(aiGame, loki.targetId);
              var targetName = target ? target.name : '؟';
              if (loki.targetId === aiMyId) {
                var stolenCard = null;
                for (var i = 0; i < aiGame.players.length; i++) {
                  if (aiGame.players[i].id === pre.id) {
                    for (var j = 0; j < aiGame.players[i].hand.length; j++) {
                      if (aiGame.players[i].hand[j].id === res.stolenId) { stolenCard = aiGame.players[i].hand[j]; break; }
                    }
                    break;
                  }
                }
                var stolenName = stolenCard ? stolenCard.name : '؟';
                Render.toast(pre.name + ' سرق مني ' + stolenName);
              } else {
                Render.toast(pre.name + ' سرق من ' + targetName + ' كارت');
              }
            }
          } else {
            Multiverse.skipPhaseTurn(aiGame, pre.id);
          }
        }
        afterLocalChange();
        if (stole && stealTarget) Render.stealReaction(pre.id, stealTarget);
      }, 1000);
    } else if (snap.phase === 'preRound' && snap.phaseTurnId === aiMyId) {
      aiGame.turnDeadline = Date.now() + 30000;
      renderLocal();
      startCountdown(Multiverse.snapshot(aiGame, aiMyId));
      aiTimer = setTimeout(function () {
        countdownTimer = null;
        var res = Multiverse.skipPhaseTurn(aiGame, aiMyId);
        if (!res.error) afterLocalChange();
      }, 30000);
    } else if (snap.phase === 'postRound' && snap.phaseTurnId !== aiMyId) {
      var post = Multiverse.getPlayer(aiGame, snap.phaseTurnId);
      aiTimer = setTimeout(function () {
        var d = AiLogic.pickReverseFlash(aiGame, post);
        if (d.use) {
          var res = Multiverse.useReverseFlash(aiGame, post.id, d.playedCardId, d.handCardId);
          if (res.ok) {
            Audio.save();
            Render.reaction(post.id, 'rescue', 0.85);
            var savedCard = null;
            var discardedCard = null;
            // find saved card name
            for (var i = 0; i < aiGame.discard.length; i++) {
              // card was added back to hand, check discard for RF card
            }
            // check hand for saved card
            for (var p = 0; p < aiGame.players.length; p++) {
              if (aiGame.players[p].id === post.id) {
                for (var j = 0; j < aiGame.players[p].hand.length; j++) {
                  if (aiGame.players[p].hand[j].id === res.savedId) { savedCard = aiGame.players[p].hand[j]; break; }
                }
                break;
              }
            }
            // find discarded card in discard pile
            for (var d2 = 0; d2 < aiGame.discard.length; d2++) {
              if (aiGame.discard[d2].id === res.discardedId) { discardedCard = aiGame.discard[d2]; break; }
            }
            var savedName = savedCard ? savedCard.name : '؟';
            var discardedName = discardedCard ? discardedCard.name : '؟';
            Render.toast(post.name + ' رجع ' + savedName + ' ورمى ' + discardedName);
          }
        } else {
          Multiverse.skipPhaseTurn(aiGame, post.id);
        }
        afterLocalChange();
      }, 1200);
    } else if (snap.phase === 'postRound' && snap.phaseTurnId === aiMyId) {
      aiGame.turnDeadline = Date.now() + 30000;
      renderLocal();
      startCountdown(Multiverse.snapshot(aiGame, aiMyId));
      aiTimer = setTimeout(function () {
        countdownTimer = null;
        var res = Multiverse.skipPhaseTurn(aiGame, aiMyId);
        if (!res.error) afterLocalChange();
      }, 30000);
    } else if (snap.phase === 'chooseType' && snap.chooserId !== aiMyId) {
      var chooser = Multiverse.getPlayer(aiGame, snap.chooserId);
      aiTimer = setTimeout(function () {
        var stat = AiLogic.pickStat(aiGame, chooser);
        Multiverse.chooseRoundType(aiGame, chooser.id, stat);
        afterLocalChange();
      }, 900);
    } else if (snap.phase === 'playing' && snap.currentPlayerId !== aiMyId) {
      var cur = Multiverse.getPlayer(aiGame, snap.currentPlayerId);
      aiTimer = setTimeout(function () {
        var ids = AiLogic.pickCards(aiGame, cur);
        Multiverse.playCards(aiGame, cur.id, ids);
        afterLocalChange();
      }, 1100);
    }
  }

  function onLokiLocal(targetId) {
    if (!aiGame) return;
    clearTimeout(aiTimer);
    clearTimeout(countdownTimer);
    countdownTimer = null;
    aiGame.turnDeadline = null;
    var res = Multiverse.useLoki(aiGame, aiMyId, targetId);
    if (res.error) { Render.toast(res.error); Audio.error(); return; }
    if (res.ok) {
      Audio.steal();
      var target = Multiverse.getPlayer(aiGame, targetId);
      var targetName = target ? target.name : '؟';
      Render.toast('سرقت ' + (res.stolenName || 'كارت') + ' من ' + targetName);
    }
    afterLocalChange();
    if (res.ok) Render.stealReaction(aiMyId, targetId);
  }

  function onTwoFaceLocal() {
    if (!aiGame) return;
    clearTimeout(aiTimer);
    clearTimeout(countdownTimer);
    countdownTimer = null;
    aiGame.turnDeadline = null;
    var res = Multiverse.useTwoFace(aiGame, aiMyId);
    if (res.error) { Render.toast(res.error); Audio.error(); return; }
    if (res.ok) {
      Render.toast('سحبت: ' + (res.drawn && res.drawn.length ? res.drawn.join(' و ') : 'كارتين'));
      Audio.twoFace();
    }
    afterLocalChange();
  }

  function onHelaLocal(targetId) {
    if (!aiGame) return;
    clearTimeout(aiTimer);
    clearTimeout(countdownTimer);
    countdownTimer = null;
    aiGame.turnDeadline = null;
    var res = Multiverse.useHela(aiGame, aiMyId, targetId);
    if (res.error) { Render.toast(res.error); Audio.error(); return; }
    if (res.ok) {
      Audio.hela();
      var target = Multiverse.getPlayer(aiGame, targetId);
      var targetName = target ? target.name : '؟';
      Render.toast('قتلت ' + (res.discardedName || 'كارت') + ' من ' + targetName);
    }
    afterLocalChange();
    if (res.ok) Render.reaction(targetId, 'hela_target', 0.85);
  }

  function onKilgraveLocal(targetId) {
    if (!aiGame) return;
    var opts = Multiverse.kilgraveOptions(aiGame, targetId);
    if (opts.error) { Render.toast(opts.error); Audio.error(); return; }
    var target = Multiverse.getPlayer(aiGame, targetId);
    var targetName = target ? target.name : '؟';
    Render.showKilgravePicker(Multiverse.snapshot(aiGame, aiMyId), targetId, targetName, opts.cardIds);
  }

  function onKilgravePickLocal(targetId, cardId) {
    if (!aiGame) return;
    clearTimeout(aiTimer);
    clearTimeout(countdownTimer);
    countdownTimer = null;
    aiGame.turnDeadline = null;
    var res = Multiverse.useKilgrave(aiGame, aiMyId, targetId, cardId);
    if (res.error) { Render.toast(res.error); Audio.error(); return; }
    Audio.kilgrave();
    var target = Multiverse.getPlayer(aiGame, targetId);
    var targetName = target ? target.name : '؟';
    Render.toast('Kilgrave سيطر على ' + targetName + ' — هيجبر يلعب كارت معين');
    Render.reaction(targetId, 'controlled', 0.85);
    afterLocalChange();
  }

  function onRiddlerLocal() {
    if (!aiGame) return;
    clearTimeout(aiTimer);
    clearTimeout(countdownTimer);
    countdownTimer = null;
    aiGame.turnDeadline = null;
    var res = Multiverse.useRiddler(aiGame, aiMyId);
    if (res.error) { Render.toast(res.error); Audio.error(); return; }
    Audio.riddler();
    if (res.ok && res.peeks && res.peeks.length) {
      Render.toast('Riddler: شفت كارت من كل لاعب');
      Render.showRiddlerPeek(res.peeks);
    } else {
      Render.toast('Riddler: مفيش كروت عند الخصوم');
    }
    afterLocalChange();
  }

  function onTranslucentLocal() {
    if (!aiGame) return;
    clearTimeout(aiTimer);
    clearTimeout(countdownTimer);
    countdownTimer = null;
    aiGame.turnDeadline = null;
    var res = Multiverse.useTranslucent(aiGame, aiMyId);
    if (res.error) { Render.toast(res.error); Audio.error(); return; }
    Audio.translucent();
    Render.toast('اختفيته — مفيش حد يقدر يستهدفك بالكروت لمدة جولتين');
    afterLocalChange();
  }

  function onMrFreezeLocal(targetId) {
    if (!aiGame) return;
    var opts = Multiverse.kilgraveOptions(aiGame, targetId);
    if (opts.error) { Render.toast(opts.error); Audio.error(); return; }
    var target = Multiverse.getPlayer(aiGame, targetId);
    var targetName = target ? target.name : '؟';
    Render.showMrFreezePicker(Multiverse.snapshot(aiGame, aiMyId), targetId, targetName, opts.cardIds);
  }

  function onMrFreezePickLocal(targetId, cardId) {
    if (!aiGame) return;
    clearTimeout(aiTimer);
    clearTimeout(countdownTimer);
    countdownTimer = null;
    aiGame.turnDeadline = null;
    var res = Multiverse.useMrFreeze(aiGame, aiMyId, targetId, cardId);
    if (res.error) { Render.toast(res.error); Audio.error(); return; }
    Audio.mrFreeze();
    var target = Multiverse.getPlayer(aiGame, targetId);
    var targetName = target ? target.name : '؟';
    Render.toast('جمّدت كارت عند ' + targetName + ' لمدة جولتين');
    Render.reaction(targetId, 'frozen', 0.85);
    afterLocalChange();
  }

  function onSaveLocal(playedCardId, handCardId) {
    if (!aiGame) return;
    clearTimeout(aiTimer);
    clearTimeout(countdownTimer);
    countdownTimer = null;
    aiGame.turnDeadline = null;
    var res = Multiverse.useReverseFlash(aiGame, aiMyId, playedCardId, handCardId);
    if (res.error) { Render.toast(res.error); Audio.error(); return; }
    Audio.save();
    afterLocalChange();
  }

  function onSkipLocal() {
    if (!aiGame) return;
    clearTimeout(aiTimer);
    clearTimeout(countdownTimer);
    countdownTimer = null;
    aiGame.turnDeadline = null;
    var res = Multiverse.skipPhaseTurn(aiGame, aiMyId);
    if (res.error) { Render.toast(res.error); Audio.error(); return; }
    afterLocalChange();
  }

  function onTypeLocal(stat) {
    if (!aiGame) return;
    if (!Multiverse.canAct(aiGame, aiMyId)) return;
    Multiverse.chooseRoundType(aiGame, aiMyId, stat);
    afterLocalChange();
  }

  function onPlayLocal() {
    if (!aiGame) return;
    var ids = Render.selectedIds();
    if (!ids.length) { Render.toast('اختار كارت واحد على الأقل'); return; }
    var res = Multiverse.playCards(aiGame, aiMyId, ids);
    if (res.error) { Render.toast(res.error); Audio.error(); return; }
    afterLocalChange();
  }

  function onContinueLocal() {
    if (!aiGame) return;
    if (Multiverse.snapshot(aiGame, aiMyId).phase !== 'revealed') return;
    Multiverse.continueAfterReveal(aiGame);
    afterLocalChange();
  }

  function onSwapLocal(handCardId) {
    if (!aiGame) return;
    var res = Multiverse.resolveSwap(aiGame, aiMyId, handCardId);
    if (res.error) { Render.toast(res.error); Audio.error(); return; }
    Audio.swap();
    afterLocalChange();
  }

  function startAiMode() {
    var name = q('ai-name').value.trim() || 'أنت';
    clearTimeout(aiTimer);
    aiGame = Multiverse.createGame({ players: buildPlayers(name, aiCount), cards: CARD_POOL, spectate: true });
    aiMyId = 'human';
    Audio.startGame();
    Render.setOnline(false);
    Chat.setMyId('human');
    Chat.setOnline(false);
    Chat.enable();
    Chat.reset();
    Render.showScreen('game');
    renderLocal();
    scheduleAi();
  }

  /* ===== Online mode ===== */
  var online = { connected: false, wasOpen: false };
  var meId = null;
  var lastSnap = null;
  var p2pMode = null; // null = server WebSocket | 'host' | 'join'

  function onlineHandlers(p2p) {
    return {
      onOpen: function () {
        online.connected = true;
        online.wasOpen = true;
        if (p2p && p2pMode === 'host') Render.setStatus('رومك جاهز — شارك الكود مع أصحابك');
        else if (p2p) Render.setStatus('متصّل بالروم المباشر');
        else Render.setStatus('متصل بالسيرفر');
        Render.setOnline(true);
        Chat.setOnline(true);
        Chat.enable();
        Chat.reset();
        if (!p2p && Account.token) Net.send({ t: 'auth', token: Account.token });
      },
      onClose: function () {
        var wasOpen = online.wasOpen;
        online.connected = false;
        online.wasOpen = false;
        Chat.disable();
        if (wasOpen) {
          Render.setStatus('انقطع الاتصال — المضيف أو الخادم خرج', true);
          Render.toast('انقطع الاتصال');
          goMenu();
        } else {
          Render.setStatus('مقدرش أوصل — راجع إن الخادم شغال وإن عنوانه صح مثلًا http://192.168.1.5:3000', true);
          Render.toast('مقدرش أوصل');
        }
      },
      onError: function () {
        Render.setStatus('فشل الاتصال — راجع إن الخادم شغال وإن عنوانه مكتوب صح', true);
      },
      onState: handleState,
      onSteal: function (ev) {
        Audio.steal();
        if (ev.stolenName) Render.toast('سرقت ' + ev.stolenName + ' من ' + (ev.targetName || 'الخصم'));
        Render.stealReaction(ev.by, ev.target);
      },
      onCardSave: function () { Audio.save(); },
      onCardSwap: function () { Audio.swap(); },
      onTwoFaceEvt: function (ev) {
        if (ev.drawn && ev.drawn.length) Render.toast('سحبت: ' + ev.drawn.join(' و '));
        Audio.twoFace();
      },
      onHelaEvt: function (ev) {
        Audio.hela();
        if (ev.discardedName) Render.toast('قتلت ' + ev.discardedName + ' من ' + (ev.targetName || 'الخصم'));
        Render.stealReaction(ev.by, ev.target);
      },
      onKilgraveTargets: function (ev) {
        Render.showKilgravePicker(lastSnap, ev.targetId, ev.targetName, ev.cardIds);
      },
      onMrFreezeTargets: function (ev) {
        Render.showMrFreezePicker(lastSnap, ev.targetId, ev.targetName, ev.cardIds);
      },
      onKilgraveEvt: function (ev) {
        Audio.kilgrave();
        var byName = ev.byName || 'خصم';
        var targetName = ev.targetName || '؟';
        if (ev.target === meId) Render.toast(byName + ' سيطر عليك بـ Kilgrave — هتتجبَر تلعب كارت معين');
        else Render.toast(byName + ' سيطر على ' + targetName + ' بـ Kilgrave');
      },
      onRiddlerEvt: function (ev) {
        Audio.riddler();
        if (ev.peeks && ev.peeks.length) {
          Render.toast('Riddler: شفت كارت من كل لاعب');
          Render.showRiddlerPeek(ev.peeks);
        } else {
          Render.toast('خصم استخدم Riddler');
        }
      },
      onMrFreezeEvt: function (ev) {
        Audio.mrFreeze();
        var byName = ev.byName || 'خصم';
        var targetName = ev.targetName || '؟';
        if (ev.target === meId) Render.toast(byName + ' جمّد كارت عندك لمدة جولتين');
        else Render.toast(byName + ' جمّد كارت عند ' + targetName + ' لمدة جولتين');
      },
      onTranslucentEvt: function (ev) {
        Audio.translucent();
        var byName = ev.byName || 'خصم';
        if (ev.by === meId) Render.toast('اختفيت — مفيش حد يقدر يستهدفك بالكروت لمدة جولتين');
        else Render.toast(byName + ' استخدم Translucent واختفي لمدة جولتين');
      },
      onStats: function (ev) {
        if (ev.user) Account.setUser(ev.user, null);
        if (ev.won && ev.coinsGained > 0) {
          Audio.coins();
          Render.toast('فزت في الماتش! +' + ev.coinsGained + ' كوينز');
        }
      },
      onServerError: function (m) { Render.setStatus(m, true); Audio.error(); },
      onChat: function (m) { Chat.handle(m); },
      onChatHistory: function (m) { Chat.handleHistory(m.messages); }
    };
  }

  function startP2PHost() {
    Audio.unlock(); Audio.click();
    if (typeof P2P === 'undefined') { Render.setStatus('مكتبة الاتصال المباشر مش اتحملت — افحص اتصالك بالإنترنت', true); return; }
    var name = q('p2p-name').value.trim() || 'لاعب';
    var avatar = Account.user ? (Account.user.avatar || '') : '';
    p2pMode = 'host';
    Render.setStatus('بيجهّز رومك المباشر (بيتصل بخدمة الإشارة)...');
    Net.setTransport(P2P);
    P2P.connect({ mode: 'host', name: name, avatar: avatar }, onlineHandlers(true));
    Render.showScreen('online');
  }

  function joinP2P() {
    Audio.unlock(); Audio.click();
    if (typeof P2P === 'undefined') { Render.setStatus('مكتبة الاتصال المباشر مش اتحملت — افحص اتصالك بالإنترنت', true); return; }
    var name = q('p2p-name2').value.trim() || 'لاعب';
    var code = q('p2p-code').value.trim().toUpperCase();
    if (code.length < 6) { Render.setStatus('اكتب كود المضيف (6 حروف/أرقام)', true); return; }
    var avatar = Account.user ? (Account.user.avatar || '') : '';
    p2pMode = 'join';
    Render.setStatus('بيتصل بالمضيف...');
    Net.setTransport(P2P);
    P2P.connect({ mode: 'join', code: code, name: name, avatar: avatar }, onlineHandlers(true));
    Render.showScreen('online');
  }

  function connectOnline() {
    online.connected = false;
    online.wasOpen = false;
    Net.connect(onlineHandlers(false));
  }

  function handleState(msg) {
    Render.setStatus('');
    clearTimeout(countdownTimer);
    countdownTimer = null;
    meId = msg.you;
    lastSnap = msg.snapshot;
    Chat.setMyId(msg.you);
    if (!msg.started) {
      Render.showScreen('online');
      renderLobby(msg);
      return;
    }
    Render.showScreen('game');
    Render.renderGame(msg.snapshot, {
      myId: msg.you, isAiMode: false,
      onType: function (stat) { Net.send({ t: 'chooseType', stat: stat }); },
      onPlay: function () {
        var ids = Render.selectedIds();
        if (!ids.length) { Render.toast('اختار كارت واحد على الأقل'); return; }
        Net.send({ t: 'play', cardIds: ids });
      },
      onContinue: function () { Net.send({ t: 'continue' }); },
      onSwap: function (handCardId) { Net.send({ t: 'swap', handCardId: handCardId }); },
      onLoki: function (targetId) { clearTimeout(countdownTimer); countdownTimer = null; Net.send({ t: 'useLoki', targetId: targetId }); },
      onTwoFace: function () { clearTimeout(countdownTimer); countdownTimer = null; Net.send({ t: 'twoFace' }); },
      onHela: function (targetId) { clearTimeout(countdownTimer); countdownTimer = null; Net.send({ t: 'hela', targetId: targetId }); },
      onKilgrave: function (targetId) { clearTimeout(countdownTimer); countdownTimer = null; Net.send({ t: 'kilgraveTarget', targetId: targetId }); },
      onKilgravePick: function (targetId, cardId) { clearTimeout(countdownTimer); countdownTimer = null; Net.send({ t: 'useKilgrave', targetId: targetId, cardId: cardId }); },
      onRiddler: function () { clearTimeout(countdownTimer); countdownTimer = null; Net.send({ t: 'riddler' }); },
      onMrFreeze: function (targetId) { clearTimeout(countdownTimer); countdownTimer = null; Net.send({ t: 'mrFreezeTarget', targetId: targetId }); },
      onMrFreezePick: function (targetId, cardId) { clearTimeout(countdownTimer); countdownTimer = null; Net.send({ t: 'useMrFreeze', targetId: targetId, cardId: cardId }); },
      onTranslucent: function () { clearTimeout(countdownTimer); countdownTimer = null; Net.send({ t: 'translucent' }); },
      onSave: function (playedCardId, handCardId) { clearTimeout(countdownTimer); countdownTimer = null; Net.send({ t: 'useReverseFlash', playedCardId: playedCardId, handCardId: handCardId }); },
      onSkip: function () { clearTimeout(countdownTimer); countdownTimer = null; Net.send({ t: 'skipPhase' }); },
      onRestart: null,
      onMenu: goMenu
    });
    if (msg.snapshot && (msg.snapshot.phase === 'preRound' || msg.snapshot.phase === 'postRound') && msg.snapshot.phaseTurnId === msg.you) {
      startCountdown(msg.snapshot);
    }
  }

  function renderLobby(msg) {
    q('lobby').classList.remove('hidden');
    q('lobby-code').textContent = msg.code;
    var list = q('lobby-players');
    list.innerHTML = '';
    msg.players.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'player-row' + (p.id === msg.you ? ' me' : '');
      var av = p.avatar ? '<img class="row-avatar" src="' + p.avatar + '" alt="">' : '';
      row.innerHTML = av + '<span>' + p.name + (p.id === msg.you ? ' (أنت)' : '') + '</span>' + (p.host ? '<span class="tag">مضيف</span>' : '');
      list.appendChild(row);
    });
    var host = q('lobby-host-control');
    host.innerHTML = '';
    if (msg.hostId === msg.you) {
      var btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = 'ابدأ اللعبة (' + msg.players.length + '/4)';
      btn.disabled = msg.players.length < 2;
      btn.onclick = function () { Audio.click(); Net.send({ t: 'start' }); };
      host.appendChild(btn);
    }
  }

  /* ===== wiring ===== */
  function setup() {
    Render.startBackground();
    Render.renderRulesHint();

    var svField = q('server-url');
    if (svField && typeof Config !== 'undefined' && Config.server) svField.value = Config.server();

    Account.init();
    Account.onDone = function () { Render.showScreen('menu'); };

    q('btn-ai').onclick = function () { Audio.unlock(); Audio.click(); Render.showScreen('ai'); };
    q('btn-online').onclick = function () {
      Audio.unlock(); Audio.click();
      var sv = q('server-url');
      if (sv && typeof Config !== 'undefined' && Config.setServer) Config.setServer(sv.value.trim());
      Render.setStatus('');
      connectOnline();
      Render.showScreen('online');
    };
    q('btn-ai-start').onclick = function () { Audio.click(); startAiMode(); };
    q('btn-ai-back').onclick = function () { Audio.click(); goMenu(); };
    q('btn-online-back').onclick = function () { Audio.click(); goMenu(); };
    q('btn-quit').onclick = function () { Audio.click(); goMenu(); };

    q('btn-create').onclick = function () {
      Audio.unlock(); Audio.click();
      var name = q('create-name').value.trim() || 'لاعب';
      Net.send({ t: 'create', name: name, token: Account.token || undefined });
    };
    q('btn-join').onclick = function () {
      Audio.unlock(); Audio.click();
      var name = q('join-name').value.trim() || 'لاعب';
      var code = q('join-code').value.trim().toUpperCase();
      if (!code) { Render.setStatus('اكتب كود الدعوة', true); return; }
      Net.send({ t: 'join', code: code, name: name, token: Account.token || undefined });
    };
    q('btn-copy-code').onclick = function () {
      Audio.click();
      if (navigator.clipboard) navigator.clipboard.writeText(q('lobby-code').textContent);
      Render.toast('تم نسخ الكود');
    };
    q('btn-leave').onclick = function () { Audio.click(); Net.send({ t: 'leave' }); goMenu(); };

    var p2pModeBtns = document.querySelectorAll('#online-p2p-mode button');
    p2pModeBtns.forEach(function (b) {
      b.onclick = function () {
        Audio.click();
        p2pModeBtns.forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        var isHost = b.dataset.mode === 'host';
        q('p2p-fields-host').style.display = isHost ? 'flex' : 'none';
        q('p2p-fields-join').style.display = isHost ? 'none' : 'flex';
      };
    });
    q('btn-p2p-host').onclick = function () { startP2PHost(); };
    q('btn-p2p-join').onclick = function () { joinP2P(); };

    document.querySelectorAll('#screen-online .tab').forEach(function (t) {
      t.onclick = function () {
        Audio.click();
        document.querySelectorAll('#screen-online .tab').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        document.querySelectorAll('#screen-online .tab-body').forEach(function (x) { x.classList.remove('active'); });
        q('tab-' + t.dataset.tab).classList.add('active');
      };
    });

    document.querySelectorAll('#ai-count button').forEach(function (b) {
      b.onclick = function () {
        Audio.click();
        document.querySelectorAll('#ai-count button').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        aiCount = parseInt(b.dataset.n, 10);
      };
    });

    var muteBtns = [q('btn-mute-menu'), q('btn-mute-game')];
    muteBtns.forEach(function (b) {
      b.onclick = function () {
        Audio.unlock();
        Audio.toggleMute();
        setMuteBtns();
      };
    });

    setMuteBtns();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
