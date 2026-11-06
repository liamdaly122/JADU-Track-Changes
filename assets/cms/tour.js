/* Leeds prototyping CMS - the tour
   Eight short steps, each with a small moving picture of the CMS and a few words. It opens by itself once, after
   someone creates an account, and can be watched again from Help or the account menu.
   UOL_TOUR.start({ name, onDone }) opens it; onDone runs when it is finished or closed.
   Arrow keys move between steps and Esc closes it. With reduced motion, the pictures stand still. */
(function () {
  'use strict';

  function h(tag, cls, kids, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    (kids || []).forEach(function (k) { if (k) e.appendChild(k); });
    return e;
  }
  function lines(n, cls) { var out = []; for (var i = 0; i < n; i++) out.push(h('i', 'ts-line' + (i === n - 1 ? ' ts-line--short' : '') + (cls ? ' ' + cls : ''))); return out; }
  /* a small CMS window: a dark bar with dots, then its content */
  function win(kids, cls) { return h('div', 'ts-win' + (cls ? ' ' + cls : ''), [h('div', 'ts-win__bar', [h('i'), h('i'), h('i')]), h('div', 'ts-win__body', kids)]); }
  function cursor(cls) { return h('span', 'ts-cursor ' + (cls || '')); }
  function avatar(text, colour, cls) { var a = h('span', 'ts-avatar ' + (cls || ''), null, text); a.style.background = colour; return a; }

  var STEPS = [
    {
      title: function (o) { return 'Welcome' + (o.name ? ', ' + o.name.split(' ')[0] : '') + '!'; },
      text: 'This is where you prototype leeds.ac.uk pages with the real University design system, so what you build looks exactly like the live site. Here is a two-minute look around.',
      scene: function () {
        return win([
          h('div', 'ts-mast', [h('b', 'ts-mast__logo'), h('span', 'ts-mast__nav', lines(3))]),
          h('div', 'ts-hero ts-in ts-d1'),
          h('div', 'ts-row ts-in ts-d2', [h('div', 'ts-card'), h('div', 'ts-card'), h('div', 'ts-card')]),
          h('div', 'ts-text ts-in ts-d3', lines(3)),
          h('div', 'ts-quote ts-in ts-d4', [h('b', null, null, '“'), h('span', null, lines(2))])
        ], 'ts-win--welcome');
      }
    },
    {
      title: 'Projects hold your work',
      text: 'A project is a set of pages, like a faculty site or a campaign. Everything is saved in the cloud as you go. Share a project and colleagues can edit it with you, or just look.',
      scene: function () {
        return h('div', 'ts-projects', [
          h('div', 'ts-pcard ts-in ts-d1', [h('b', 'ts-pcard__icon', null, 'UG'), h('span', null, lines(2))]),
          h('div', 'ts-pcard ts-pcard--pick ts-in ts-d2', [h('b', 'ts-pcard__icon ts-pcard__icon--b', null, 'SA'), h('span', null, lines(2)), h('span', 'ts-pcard__people', [avatar('SB', '#156265', 'ts-pop ts-d5'), avatar('AK', '#7a3e9d', 'ts-pop ts-d6')])]),
          h('div', 'ts-pcard ts-in ts-d3', [h('b', 'ts-pcard__icon ts-pcard__icon--c', null, 'PG'), h('span', null, lines(2))]),
          h('div', 'ts-share ts-pop ts-d4', [h('span', 'ts-share__field', [h('span', 'ts-type', null, 'sam@leeds.ac.uk')]), h('b', 'ts-btn', null, 'Share')]),
          cursor('ts-cursor--projects')
        ]);
      }
    },
    {
      title: 'Bring in live pages',
      text: 'Open any leeds.ac.uk page and press the grabber in your browser. The page arrives in the CMS as editable blocks, with an untouched copy kept so you can see what you changed.',
      scene: function () {
        return h('div', 'ts-import', [
          win([h('div', 'ts-hero ts-hero--live'), h('div', 'ts-text', lines(3)), h('div', 'ts-row', [h('div', 'ts-card'), h('div', 'ts-card')])], 'ts-win--live'),
          h('b', 'ts-grab', null, 'Send to CMS'),
          h('div', 'ts-fly'),
          win([h('div', 'ts-list', [h('div', 'ts-list__row', lines(1)), h('div', 'ts-list__row', lines(1)), h('div', 'ts-list__row ts-list__row--new', [h('i', 'ts-line'), h('b', 'ts-tag', null, 'New')])])], 'ts-win--cms'),
          cursor('ts-cursor--import')
        ]);
      }
    },
    {
      title: 'Edit right in the preview',
      text: 'Click a block to select it: a toolbar appears to move, copy or delete it. Double-click any text to change it where it is. The panel on the right has every setting for the block.',
      scene: function () {
        return win([
          h('div', 'ts-edit', [
            h('div', 'ts-edit__page', [
              h('div', 'ts-hero ts-hero--short'),
              h('div', 'ts-block ts-block--pick', [
                h('div', 'ts-toolbar', [h('i'), h('b', null, null, 'Content'), h('i'), h('i'), h('i')]),
                h('span', 'ts-heading', [h('span', 'ts-type ts-type--edit', null, 'Study in Leeds')]),
                h('span', null, lines(2))
              ]),
              h('div', 'ts-block', lines(3))
            ]),
            h('div', 'ts-edit__side', [h('b', 'ts-side__title'), h('i', 'ts-field'), h('i', 'ts-field'), h('i', 'ts-field ts-field--short')])
          ]),
          cursor('ts-cursor--edit')
        ]);
      }
    },
    {
      title: 'Add components from the library',
      text: 'The + button opens the components this kind of page can hold. Homepages take widgets; document pages take what the Jadu editor allows, so a prototype never uses something Jadu cannot do.',
      scene: function () {
        return win([
          h('div', 'ts-add', [
            h('b', 'ts-plus', null, '+'),
            h('div', 'ts-picker', [
              h('div', 'ts-picker__head', [h('b', null, null, 'Document page library')]),
              h('div', 'ts-picker__grid', [h('i'), h('i', 'ts-pick'), h('i'), h('i'), h('i'), h('i')])
            ]),
            h('div', 'ts-add__page', [h('div', 'ts-block', lines(2)), h('div', 'ts-block ts-block--new', [h('b', 'ts-accordion'), h('b', 'ts-accordion'), h('b', 'ts-accordion')])])
          ]),
          cursor('ts-cursor--add')
        ]);
      }
    },
    {
      title: 'Check, comment and sign off',
      text: 'The Review tab checks each page for problems like missing alt text. Colleagues comment on any block, and Send for review gets the page approved, by your team or through a link for people without an account.',
      scene: function () {
        return h('div', 'ts-review', [
          win([h('div', 'ts-block', lines(2)), h('div', 'ts-block ts-block--comment', [h('span', null, lines(2)), h('b', 'ts-pin', null, '1')]), h('div', 'ts-block', lines(2))], 'ts-win--page'),
          h('div', 'ts-panel', [
            h('b', 'ts-panel__title', null, 'Review'),
            h('div', 'ts-check ts-d1', [h('i', 'ts-tick'), h('span', null, lines(1))]),
            h('div', 'ts-check ts-d2', [h('i', 'ts-tick'), h('span', null, lines(1))]),
            h('div', 'ts-check ts-d3', [h('i', 'ts-tick'), h('span', null, lines(1))]),
            h('div', 'ts-bubble', [avatar('AK', '#7a3e9d'), h('span', null, lines(2))]),
            h('b', 'ts-approved', null, 'Approved')
          ])
        ]);
      }
    },
    {
      title: 'Hand over to Jadu',
      text: 'Changes lists everything that differs from the live page, with the words marked. Send it as Word or PDF to whoever edits Jadu, and they tick each change off as they go.',
      scene: function () {
        return win([
          h('div', 'ts-changes', [
            h('div', 'ts-change', [h('i', 'ts-box ts-d2'), h('span', null, [h('i', 'ts-line ts-del'), h('i', 'ts-line ts-ins')])]),
            h('div', 'ts-change', [h('i', 'ts-box ts-d3'), h('span', null, [h('i', 'ts-line'), h('i', 'ts-line ts-ins ts-line--short')])]),
            h('div', 'ts-change', [h('i', 'ts-box ts-d4'), h('span', null, [h('i', 'ts-line ts-del ts-line--short'), h('i', 'ts-line')])]),
            h('div', 'ts-progress', [h('i')]),
            h('div', 'ts-docs', [h('b', null, null, 'Word'), h('b', null, null, 'PDF')])
          ])
        ]);
      }
    },
    {
      title: 'Work together',
      text: 'You can see who else is in a project and which page they are on. If someone has a page open, their name shows on the block they picked. Changes to different blocks are merged, so nobody’s work is lost.',
      scene: function () {
        return win([
          h('div', 'ts-together', [
            h('div', 'ts-together__top', [avatar('SB', '#156265', 'ts-pop ts-d1'), avatar('AK', '#7a3e9d', 'ts-pop ts-d2'), h('i', 'ts-sync')]),
            h('div', 'ts-note ts-pop ts-d3', [avatar('SB', '#156265', 'ts-avatar--sm'), h('span', null, lines(1))]),
            h('div', 'ts-block ts-block--peer', [h('b', 'ts-peer', null, 'Sam'), h('span', null, lines(2))]),
            h('div', 'ts-block ts-block--mine', [h('span', 'ts-heading', [h('span', 'ts-type', null, 'Funding')]), h('span', null, lines(1))])
          ])
        ]);
      }
    }
  ];

  var open = null;
  function start(opts) {
    opts = opts || {};
    if (open) open.close(false);
    var i = 0, done = false;
    var stage = h('div', 'tour__stage');
    var count = h('p', 'tour__count');
    var title = h('h2', 'tour__title'); title.id = 'tour-title';
    var text = h('p', 'tour__text');
    var dots = h('div', 'tour__dots');
    var back = h('button', 'btn', null, 'Back'); back.type = 'button';
    var next = h('button', 'btn btn--primary', null, 'Next'); next.type = 'button';
    var skip = h('button', 'tour__skip', null, 'Skip the tour'); skip.type = 'button';
    var closeX = h('button', 'tour__close', null, '✕'); closeX.type = 'button'; closeX.setAttribute('aria-label', 'Close the tour');
    STEPS.forEach(function (s, n) { var d = h('button', 'tour__dot'); d.type = 'button'; d.setAttribute('aria-label', 'Step ' + (n + 1)); d.onclick = function () { show(n); }; dots.appendChild(d); });
    var card = h('div', 'tour__card', [closeX, stage, h('div', 'tour__body', [count, title, text, h('div', 'tour__foot', [dots, h('span', 'tour__spacer'), skip, back, next])])]);
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'tour-title');
    var overlay = h('div', 'tour', [card]);
    var before = document.activeElement;
    function show(n) {
      i = Math.max(0, Math.min(STEPS.length - 1, n));
      var s = STEPS[i];
      stage.innerHTML = '';
      // a fresh copy of the picture each time, so its animation starts from the beginning
      var sc = h('div', 'tour__scene tour__scene--' + i, [s.scene()]);
      stage.appendChild(sc);
      count.textContent = 'Step ' + (i + 1) + ' of ' + STEPS.length;
      title.textContent = typeof s.title === 'function' ? s.title(opts) : s.title;
      text.textContent = s.text;
      Array.prototype.forEach.call(dots.children, function (d, k) { d.classList.toggle('is-on', k === i); d.setAttribute('aria-current', k === i ? 'step' : 'false'); });
      back.hidden = i === 0;
      next.textContent = i === STEPS.length - 1 ? 'Start using the CMS' : 'Next';
      skip.hidden = i === STEPS.length - 1;
      next.focus();
    }
    function close(finished) {
      if (done) return; done = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.classList.add('is-closing');
      setTimeout(function () { overlay.remove(); }, 180);
      open = null;
      if (before && before.focus) try { before.focus(); } catch (e) {}
      if (opts.onDone) opts.onDone(!!finished);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (i < STEPS.length - 1) show(i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); show(i - 1); }
      else if (e.key === 'Tab') {
        // keep the focus inside the tour
        var f = Array.prototype.filter.call(card.querySelectorAll('button'), function (b) { return !b.hidden && b.offsetParent !== null; });
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    }
    next.onclick = function () { if (i === STEPS.length - 1) close(true); else show(i + 1); };
    back.onclick = function () { show(i - 1); };
    skip.onclick = function () { close(false); };
    closeX.onclick = function () { close(false); };
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    show(0);
    open = { close: close, show: show };
    return open;
  }

  window.UOL_TOUR = { start: start, steps: STEPS.length };
})();
