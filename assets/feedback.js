/* SB PORTAL フィードバック（サイトの改善点を送る） */
(function () {
  'use strict';
  var ENDPOINT = window.SB_FEEDBACK_URL || '';

  var CATEGORIES = ['見づらい・読みにくい', '分かりにくい', '情報が違う・足りない', 'うまく動かない', 'その他・提案'];

  // 選べる場所（小さいもの → 大きいもの）。タップした位置からいちばん近いものを選ぶ
  var PICKABLE = [
    'img', 'h1', 'h2', 'h3', 'h4', 'summary', 'a.upcoming-register', '.event-deadline',
    '.upcoming-event-facts', '.upcoming-event-notes', '.event-more-body > p',
    '.pj-list > li', '.pj-next-row', '.iq-link', '.page-menu', '.calendar-view-switcher', '.calendar-frame-shell',
    '.upcoming-event-card', '.pj-card', '.important-notice', '.important-quick',
    '.topbar', 'section', '#sec-events'
  ].join(',');

  var SECTION_NAMES = {
    'sec-important': '大切なお知らせ', 'sec-projects': 'プロジェクトからの連絡',
    'sec-events': '申込受付中のイベント', 'sec-schedule': '今後の予定'
  };

  var state = { scope: null, el: null, label: '', category: '' };
  var root, sheet, banner, hl;

  function $(s, c) { return (c || document).querySelector(s); }
  function txt(el) { return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  function cut(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }

  /* ---------- 場所の名前をつくる ---------- */
  function kindOf(el) {
    var t = el.tagName.toLowerCase(), c = el.classList;
    if (t === 'img') return '画像';
    if (/^h[1-4]$/.test(t)) return '見出し';
    if (t === 'summary') return '開閉ボタン';
    if (c.contains('upcoming-register')) return '申込ボタン';
    if (c.contains('event-deadline')) return '申込締切';
    if (c.contains('upcoming-event-facts')) return '日時・場所';
    if (c.contains('upcoming-event-notes')) return '補足';
    if (el.matches('.event-more-body > p')) return '説明文';
    if (el.matches('.pj-list > li') || c.contains('pj-next-row')) return '予定「' + cut(txt($('b', el) || el), 24) + '」';
    if (c.contains('iq-link')) return 'リンク「' + cut(txt($('b', el) || el), 16) + '」';
    if (c.contains('page-menu')) return 'ページ内メニュー';
    if (c.contains('calendar-view-switcher')) return '表示切替ボタン';
    if (c.contains('calendar-frame-shell')) return 'カレンダー';
    if (c.contains('upcoming-event-card') || c.contains('pj-card') || c.contains('important-notice')) return 'この枠全体';
    if (c.contains('important-quick')) return 'リンク集';
    if (c.contains('topbar')) return 'ページ上部（ヘッダー）';
    return 'この欄全体';
  }
  function labelOf(el) {
    var parts = [];
    var sec = el.closest('#sec-important,#sec-projects,#sec-events,#sec-schedule');
    if (el.closest('.topbar')) parts.push('ページ上部');
    else if (sec) parts.push(SECTION_NAMES[sec.id]);
    else parts.push('ページ');
    var card = el.closest('.upcoming-event-card,.pj-card,.important-notice');
    if (card) {
      var t = $('h3', card) || $('h2', card);
      parts.push('「' + cut(txt(t), 28) + '」');
    }
    var isSection = (el === sec) || el.tagName === 'SECTION';
    parts.push(isSection ? 'この欄全体' : kindOf(el));
    // 重複を除く
    return parts.filter(function (p, i) { return parts.indexOf(p) === i; }).join(' ＞ ');
  }
  function pathOf(el) {
    var p = [];
    while (el && el !== document.body && p.length < 6) {
      var s = el.tagName.toLowerCase();
      if (el.id) { s += '#' + el.id; p.unshift(s); break; }
      if (el.classList.length) s += '.' + el.classList[0];
      p.unshift(s); el = el.parentElement;
    }
    return p.join(' > ');
  }
  function pickFrom(target) {
    var el = target && target.closest && target.closest(PICKABLE);
    if (!el || el.closest('.fb-root')) return null;
    return el;
  }
  function widen(el) {
    var p = el.parentElement;
    while (p && p !== document.body) {
      if (p.matches(PICKABLE) && !p.closest('.fb-root')) {
        var r1 = el.getBoundingClientRect(), r2 = p.getBoundingClientRect();
        if (Math.abs(r1.width - r2.width) > 4 || Math.abs(r1.height - r2.height) > 4) return p;
      }
      p = p.parentElement;
    }
    return null;
  }

  /* ---------- 画面部品 ---------- */
  function build() {
    root = document.createElement('div');
    root.className = 'fb-root';
    root.innerHTML =
      '<div class="fb-hl" hidden></div>' +
      '<div class="fb-banner" role="status" hidden>' +
        '<p class="fb-banner-msg"></p>' +
        '<div class="fb-banner-btns">' +
          '<button type="button" class="fb-btn-sub" data-act="widen">範囲を広げる</button>' +
          '<button type="button" class="fb-btn-main" data-act="decide">ここについて書く</button>' +
          '<button type="button" class="fb-btn-text" data-act="cancel">やめる</button>' +
        '</div>' +
      '</div>' +
      '<div class="fb-overlay" hidden></div>' +
      '<div class="fb-sheet" role="dialog" aria-modal="true" aria-labelledby="fb-title" hidden>' +
        '<button type="button" class="fb-close" data-act="close" aria-label="閉じる">×</button>' +
        '<div class="fb-step" data-step="1">' +
          '<h2 id="fb-title">サイトの改善点を教えてください</h2>' +
          '<p class="fb-lead">どこについての意見ですか？</p>' +
          '<button type="button" class="fb-choice" data-act="pick"><b>場所を選んで指摘する</b><span>画面をタップして、気になる場所を選びます</span></button>' +
          '<button type="button" class="fb-choice" data-act="whole"><b>サイト全体について</b><span>場所を選ばずに、全体の改善点を書きます</span></button>' +
        '</div>' +
        '<form class="fb-step" data-step="2" hidden novalidate>' +
          '<h2>改善点を書いてください</h2>' +
          '<div class="fb-target"><span>対象</span><b class="fb-target-label"></b><button type="button" class="fb-btn-text" data-act="repick">選び直す</button></div>' +
          '<fieldset class="fb-cats"><legend>どんなことですか？（任意）</legend></fieldset>' +
          '<label class="fb-field"><span>コメント<em>必須</em></span>' +
            '<textarea name="comment" rows="5" maxlength="1000" placeholder="例：スマホで見ると文字が小さくて読みにくいです。"></textarea></label>' +
          '<label class="fb-field"><span>名前（任意）</span><input name="name" type="text" maxlength="40" autocomplete="name" placeholder="書かなくても送れます"></label>' +
          '<p class="fb-error" role="alert" hidden></p>' +
          '<button type="submit" class="fb-btn-main fb-send">送信する</button>' +
        '</form>' +
        '<div class="fb-step fb-done" data-step="3" hidden>' +
          '<h2>送信しました</h2><p>ありがとうございます。いただいた意見は、サイトの改善に使います。</p>' +
          '<button type="button" class="fb-btn-main" data-act="close">閉じる</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    sheet = $('.fb-sheet', root); banner = $('.fb-banner', root); hl = $('.fb-hl', root);
    var cats = $('.fb-cats', root);
    CATEGORIES.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'fb-chip'; b.textContent = c; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        var on = b.getAttribute('aria-pressed') !== 'true';
        cats.querySelectorAll('.fb-chip').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        state.category = on ? c : '';
      });
      cats.appendChild(b);
    });
    root.addEventListener('click', onRootClick);
    $('.fb-overlay', root).addEventListener('click', close);
    $('form', root).addEventListener('submit', send);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!banner.hidden) stopPick(); else if (!sheet.hidden) close();
    });
  }

  function step(n) {
    sheet.querySelectorAll('.fb-step').forEach(function (s) { s.hidden = s.getAttribute('data-step') !== String(n); });
  }
  function open() {
    if (!root) build();
    state = { scope: null, el: null, label: '', category: '' };
    $('form', root).reset();
    root.querySelectorAll('.fb-chip').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
    step(1); showSheet();
  }
  function showSheet() {
    $('.fb-overlay', root).hidden = false; sheet.hidden = false;
    document.documentElement.classList.add('fb-lock');
    var f = sheet.querySelector('.fb-step:not([hidden]) button, .fb-step:not([hidden]) textarea');
    if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function hideSheet() {
    $('.fb-overlay', root).hidden = true; sheet.hidden = true;
    document.documentElement.classList.remove('fb-lock');
  }
  function close() { hideSheet(); stopPick(); clearMark(); }

  function onRootClick(e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var a = b.getAttribute('data-act');
    if (a === 'close') close();
    else if (a === 'pick' || a === 'repick') startPick();
    else if (a === 'whole') { state.scope = 'whole'; state.el = null; state.label = 'サイト全体'; toForm(); }
    else if (a === 'widen') { var w = state.el && widen(state.el); if (w) select(w); }
    else if (a === 'decide') { if (state.el) { stopPick(); toForm(); } }
    else if (a === 'cancel') { stopPick(); clearMark(); step(1); showSheet(); }
  }

  /* ---------- 場所を選ぶ ---------- */
  function startPick() {
    hideSheet(); clearMark();
    state.el = null;
    banner.hidden = false;
    $('.fb-banner-msg', banner).innerHTML = '<b>指摘したい場所をタップしてください</b>';
    banner.querySelector('[data-act="widen"]').hidden = true;
    banner.querySelector('[data-act="decide"]').hidden = true;
    document.documentElement.classList.add('fb-picking');
    document.addEventListener('click', onPickClick, true);
    document.addEventListener('mouseover', onHover, true);
  }
  function stopPick() {
    if (!banner) return;
    banner.hidden = true;
    document.documentElement.classList.remove('fb-picking');
    document.removeEventListener('click', onPickClick, true);
    document.removeEventListener('mouseover', onHover, true);
    hl.hidden = true;
  }
  function onHover(e) {
    if (state.el) return;
    var el = pickFrom(e.target);
    if (el) place(el, false); else hl.hidden = true;
  }
  function onPickClick(e) {
    if (e.target.closest('.fb-root')) return;
    e.preventDefault(); e.stopPropagation();
    var el = pickFrom(e.target);
    if (el) select(el);
  }
  function select(el) {
    state.el = el; state.scope = 'part'; state.label = labelOf(el);
    clearMark(); el.classList.add('fb-marked');
    place(el, true);
    $('.fb-banner-msg', banner).innerHTML = '<span>選択中</span><b></b>';
    $('.fb-banner-msg b', banner).textContent = state.label;
    banner.querySelector('[data-act="widen"]').hidden = !widen(el);
    banner.querySelector('[data-act="decide"]').hidden = false;
  }
  function place(el, fixed) {
    var r = el.getBoundingClientRect();
    hl.hidden = false;
    hl.classList.toggle('is-fixed', !!fixed);
    hl.style.top = (r.top + window.scrollY - 4) + 'px';
    hl.style.left = (r.left + window.scrollX - 4) + 'px';
    hl.style.width = (r.width + 8) + 'px';
    hl.style.height = (r.height + 8) + 'px';
  }
  function clearMark() {
    document.querySelectorAll('.fb-marked').forEach(function (x) { x.classList.remove('fb-marked'); });
    if (hl) hl.hidden = true;
  }
  window.addEventListener('resize', function () { if (state.el && banner && !banner.hidden) place(state.el, true); });

  /* ---------- 入力と送信 ---------- */
  function toForm() {
    $('.fb-target-label', root).textContent = state.label;
    $('[data-act="repick"]', root).textContent = state.scope === 'whole' ? '場所を選ぶ' : '選び直す';
    $('.fb-error', root).hidden = true;
    step(2); showSheet();
    setTimeout(function () { $('textarea', root).focus(); }, 60);
  }
  var lastSent = 0;
  function send(e) {
    e.preventDefault();
    var f = e.target, comment = f.comment.value.trim(), err = $('.fb-error', root), btn = $('.fb-send', root);
    if (!comment) { err.textContent = 'コメントを入力してください。'; err.hidden = false; f.comment.focus(); return; }
    if (Date.now() - lastSent < 20000) { err.textContent = '少し時間をおいてから、もう一度送信してください。'; err.hidden = false; return; }
    if (!ENDPOINT) { err.textContent = '現在、送信機能の準備中です。'; err.hidden = false; return; }
    var el = state.el;
    var payload = {
      kind: 'feedback',
      scope: state.scope, target: state.label, category: state.category,
      comment: comment, name: f.name.value.trim(),
      element: el ? { path: pathOf(el), text: cut(txt(el), 120) } : null,
      page: location.href, device: window.matchMedia('(max-width: 760px)').matches ? 'スマホ' : 'PC',
      viewport: window.innerWidth + '×' + window.innerHeight, userAgent: navigator.userAgent
    };
    btn.disabled = true; btn.textContent = '送信中…'; err.hidden = true;
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.ok) throw new Error(j && j.error); lastSent = Date.now(); clearMark(); step(3); })
      .catch(function () { err.textContent = '送信できませんでした。インターネット接続を確認し、もう一度送信してください。'; err.hidden = false; })
      .then(function () { btn.disabled = false; btn.textContent = '送信する'; });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-feedback-open]');
    if (t) { e.preventDefault(); open(); }
  });
})();
