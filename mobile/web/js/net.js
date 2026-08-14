/* Multiverse WebSocket client. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Net = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ws = null;
  var handlers = {};
  var queue = [];
  var impl = null; // optional transport override (e.g. P2P)

  function wsUrl() {
    if (typeof Config !== 'undefined' && Config.wsUrl) return Config.wsUrl('');
    var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    return proto + location.host;
  }

  function route(msg, h) {
    h = h || handlers;
    if (msg.t === 'state') {
      if (h.onState) h.onState(msg);
    } else if (msg.t === 'error') {
      if (h.onServerError) h.onServerError(msg.msg);
    } else if (msg.t === 'steal') {
      if (h.onSteal) h.onSteal(msg);
    } else if (msg.t === 'saveEvt') {
      if (h.onCardSave) h.onCardSave(msg);
    } else if (msg.t === 'swapEvt') {
      if (h.onCardSwap) h.onCardSwap(msg);
    } else if (msg.t === 'twoFaceEvt') {
      if (h.onTwoFaceEvt) h.onTwoFaceEvt(msg);
    } else if (msg.t === 'helaEvt') {
      if (h.onHelaEvt) h.onHelaEvt(msg);
    } else if (msg.t === 'kilgraveTargets') {
      if (h.onKilgraveTargets) h.onKilgraveTargets(msg);
    } else if (msg.t === 'kilgraveEvt') {
      if (h.onKilgraveEvt) h.onKilgraveEvt(msg);
    } else if (msg.t === 'riddlerEvt') {
      if (h.onRiddlerEvt) h.onRiddlerEvt(msg);
    } else if (msg.t === 'mrFreezeTargets') {
      if (h.onMrFreezeTargets) h.onMrFreezeTargets(msg);
    } else if (msg.t === 'mrFreezeEvt') {
      if (h.onMrFreezeEvt) h.onMrFreezeEvt(msg);
    } else if (msg.t === 'translucentEvt') {
      if (h.onTranslucentEvt) h.onTranslucentEvt(msg);
    } else if (msg.t === 'stats') {
      if (h.onStats) h.onStats(msg);
    } else if (msg.t === 'chat') {
      if (h.onChat) h.onChat(msg);
    } else if (msg.t === 'chatHistory') {
      if (h.onChatHistory) h.onChatHistory(msg);
    } else if (msg.t === 'pong') {
      if (h.onPong) h.onPong();
    }
  }

  function connect(handlersIn) {
    handlers = handlersIn || {};
    queue = [];
    ws = new WebSocket(wsUrl());
    ws.onopen = function () {
      while (queue.length) {
        ws.send(JSON.stringify(queue.shift()));
      }
      if (handlers.onOpen) handlers.onOpen();
    };
    ws.onclose = function () { if (handlers.onClose) handlers.onClose(); };
    ws.onerror = function () { if (handlers.onError) handlers.onError(); };
    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      route(msg);
    };
  }

  function setTransport(t) { impl = t || null; }

  function send(obj) {
    if (impl) { impl.send(obj); return; }
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    else queue.push(obj);
  }

  function isOpen() {
    if (impl) return impl.isOpen();
    return ws && ws.readyState === WebSocket.OPEN;
  }

  function close() {
    if (impl) { impl.close(); return; }
    if (ws) { try { ws.close(); } catch (e) {} } ws = null;
  }

  return { connect: connect, send: send, isOpen: isOpen, close: close, setTransport: setTransport, route: route };
});
