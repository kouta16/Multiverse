/* Multiverse account module — register/login with name + password + avatar.
   Stats (games played / won) and coins are tracked server-side. */
(function (root) {
  'use strict';

  var TOKEN_KEY = 'multiverse_token';
  var AVATAR_PRESETS = [
    'https://i.ibb.co/bMy3m2MW/image.png',
    'https://i.ibb.co/FkNPkKHQ/image.png',
    'https://i.ibb.co/gbZj0HJK/image.png',
    'https://i.ibb.co/FPqHsZ5/image.png',
    'https://i.ibb.co/wN4QTCJk/image.png',
    'https://i.ibb.co/zTvBny4c/image.png',
    'https://i.ibb.co/kgfmyx1F/image.png',
    'https://i.ibb.co/fYbkqZsp/image.png',
    'https://i.ibb.co/Xx7ySLs6/image.png',
    'https://i.ibb.co/73G3QNr/image.png',
    'https://i.ibb.co/qKQQcyR/image.png',
    'https://i.ibb.co/s9BHMLby/image.png'
  ];

  var selectedAvatar = '';

  function $(id) { return document.getElementById(id); }
  function api(path, opts) {
    var prefix = (typeof Config !== 'undefined' && Config.apiPrefix) ? Config.apiPrefix() : '';
    return fetch(prefix + path, opts).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.error && !d.user) { var e = new Error(d.error); e.code = d.error; throw e; }
      return d;
    });
  }

  var Account = {
    token: null,
    user: null,
    onDone: null, // called after successful login/register

    init: function () {
      selectedAvatar = '';
      Account.token = localStorage.getItem(TOKEN_KEY) || null;
      buildAvatarGrid();
      wireButtons();
      renderChip();
      if (Account.token) {
        api('/api/me?token=' + encodeURIComponent(Account.token))
          .then(function (d) { Account.setUser(d.user, null); })
          .catch(function () { Account.setUser(null, null); });
      }
    },

    setUser: function (user, token) {
      Account.user = user || null;
      if (token) { Account.token = token; localStorage.setItem(TOKEN_KEY, token); }
      else if (!user) { Account.token = null; localStorage.removeItem(TOKEN_KEY); }
      renderChip();
      syncNameFields();
    },

    refresh: function () {
      if (!Account.token) return Promise.resolve(null);
      return api('/api/me?token=' + encodeURIComponent(Account.token))
        .then(function (d) { Account.setUser(d.user, null); return d.user; })
        .catch(function () { return null; });
    },

    register: function (name, pw, pw2, avatar, cb) {
      if (!name || name.trim().length < 2) return cb && cb('الاسم قصير جدًا');
      if (pw.length < 4) return cb && cb('كلمة المرور أقصر من 4 حروف');
      if (pw !== pw2) return cb && cb('كلمتا المرور مش متطابقتين');
      api('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password: pw, avatar: avatar })
      }).then(function (d) {
        Account.setUser(d.user, d.token);
        if (cb) cb(null);
      }).catch(function (e) { if (cb) cb(e.message || 'خطأ'); });
    },

    login: function (name, pw, cb) {
      if (!name) return cb && cb('اكتب الاسم');
      if (!pw) return cb && cb('اكتب كلمة المرور');
      api('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password: pw })
      }).then(function (d) {
        Account.setUser(d.user, d.token);
        if (cb) cb(null);
      }).catch(function (e) { if (cb) cb(e.message || 'خطأ'); });
    },

    logout: function () {
      if (Account.token) api('/api/logout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: Account.token })
      }).catch(function () {});
      Account.setUser(null, null);
      renderChip();
    }
  };

  /* ===== chip in the menu ===== */
  function renderChip() {
    var chip = $('account-chip');
    var loginBtn = $('ac-login-btn');
    if (!chip || !loginBtn) return;
    if (Account.user) {
      chip.classList.remove('hidden');
      loginBtn.classList.add('hidden');
      var av = $('ac-avatar');
      if (av) {
        if (Account.user.avatar) {
          av.src = Account.user.avatar;
          av.classList.remove('hidden');
        } else {
          av.classList.add('hidden');
        }
      }
      var nm = $('ac-name');
      if (nm) nm.textContent = Account.user.name;
      var st = $('ac-stats');
      if (st) st.textContent = 'لعب: ' + Account.user.gamesPlayed + ' • فوز: ' + Account.user.gamesWon + ' • 🪙 ' + Account.user.coins;
    } else {
      chip.classList.add('hidden');
      loginBtn.classList.remove('hidden');
    }
  }

  function syncNameFields() {
    var cn = $('create-name'), jn = $('join-name');
    if (Account.user) {
      if (cn) { cn.value = Account.user.name; cn.disabled = true; }
      if (jn) { jn.value = Account.user.name; jn.disabled = true; }
    } else {
      if (cn) cn.disabled = false;
      if (jn) jn.disabled = false;
    }
  }

  /* ===== avatar picker ===== */
  function buildAvatarGrid() {
    var grid = $('ac-avatar-grid');
    if (!grid) return;
    grid.innerHTML = '';
    AVATAR_PRESETS.forEach(function (url) {
      var el = document.createElement('div');
      el.className = 'avatar-opt';
      el.style.backgroundImage = 'url(' + url + ')';
      el.addEventListener('click', function () {
        selectedAvatar = url;
        markAvatar();
      });
      grid.appendChild(el);
    });
    var file = $('ac-avatar-file');
    if (file) {
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          var img = new Image();
          img.onload = function () {
            var c = document.createElement('canvas');
            c.width = 128; c.height = 128;
            var ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, 128, 128);
            selectedAvatar = c.toDataURL('image/jpeg', 0.8);
            markAvatar();
          };
          img.src = fr.result;
        };
        fr.readAsDataURL(f);
      });
    }
  }

  function markAvatar() {
    var grid = $('ac-avatar-grid');
    if (!grid) return;
    var opts = grid.querySelectorAll('.avatar-opt');
    for (var i = 0; i < opts.length; i++) opts[i].classList.remove('selected');
    // if it's a preset, highlight it
    var idx = AVATAR_PRESETS.indexOf(selectedAvatar);
    if (idx >= 0) opts[idx].classList.add('selected');
  }

  /* ===== wiring ===== */
  function wireButtons() {
    var lb = $('ac-login-btn');
    if (lb) lb.addEventListener('click', function () {
      if (root.Render && root.Render.showScreen) root.Render.showScreen('account');
    });

    var back = $('ac-back');
    if (back) back.addEventListener('click', function () {
      if (root.Render && root.Render.showScreen) root.Render.showScreen('menu');
    });

    document.querySelectorAll('#screen-account .tab').forEach(function (t) {
      t.addEventListener('click', function () {
        document.querySelectorAll('#screen-account .tab').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        document.querySelectorAll('#screen-account .tab-body').forEach(function (x) { x.classList.remove('active'); });
        var target = t.dataset.tab;
        $('ac-' + target).classList.add('active');
      });
    });

    var ls = $('ac-login-submit');
    if (ls) ls.addEventListener('click', doLogin);
    var lp = $('ac-login-pw');
    if (lp) lp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });

    var rs = $('ac-reg-submit');
    if (rs) rs.addEventListener('click', doRegister);
    var rp = $('ac-reg-pw2');
    if (rp) rp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doRegister(); });

    var lo = $('ac-logout');
    if (lo) lo.addEventListener('click', function () { Account.logout(); });
  }

  function msg(text, isError) {
    var m = $('ac-msg');
    if (!m) return;
    m.textContent = text || '';
    m.style.color = isError ? '#ff6b6b' : '#7ee787';
  }

  function doLogin() {
    msg('');
    Account.login($('ac-login-name').value, $('ac-login-pw').value, function (err) {
      if (err) return msg(err, true);
      msg('تم تسجيل الدخول');
      if (Account.onDone) Account.onDone();
    });
  }

  function doRegister() {
    msg('');
    Account.register(
      $('ac-reg-name').value, $('ac-reg-pw').value, $('ac-reg-pw2').value, selectedAvatar,
      function (err) {
        if (err) return msg(err, true);
        msg('تم إنشاء الحساب');
        if (Account.onDone) Account.onDone();
      }
    );
  }

  root.Account = Account;
})(window);
