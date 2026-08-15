/* Multiverse server config — works in browser (same-origin) and in the
   Capacitor Android app (custom server field stored in localStorage). */
(function (root) {
  'use strict';

  var KEY = 'multiverse_server';

  var Config = {
    server: function () {
      return (localStorage.getItem(KEY) || '').replace(/\/+$/, '').trim();
    },
    setServer: function (v) {
      if (v) localStorage.setItem(KEY, String(v).replace(/\/+$/, ''));
      else localStorage.removeItem(KEY);
    },
    wsUrl: function (path) {
      var portless = path || '';
      var sv = Config.server();
      if (sv) {
        var base = sv.replace(/^(https?|wss?):\/\//i, '');
        var first;
        if (/^https:\/\//i.test(sv) || /^wss:\/\//i.test(sv)) first = 'wss://';
        else if (/^http:\/\//i.test(sv) || /^ws:\/\//i.test(sv)) first = 'ws://';
        else first = (location.protocol === 'https:' ? 'wss://' : 'ws://');
        return first + base + portless;
      }
      var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
      return proto + location.host + portless;
    },
    apiPrefix: function () {
      var sv = Config.server();
      if (!sv) return '';
      if (/^https?:\/\//i.test(sv)) return sv;
      return location.protocol + '//' + sv;
    }
  };

  root.Config = Config;
})(window);