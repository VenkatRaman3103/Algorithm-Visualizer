/*
 * player.js
 * Generic step player. A structure page (stack.html, later queue.html ...)
 * calls AlgoViz.mountPlayer({ ... createView }) where createView(container,
 * result) returns { seek(pos), weights }. seek draws any fractional position
 * on the timeline; weights[k] scales how long the move into step k takes.
 * The player owns the playhead and the controls.
 */
(function (global) {
  'use strict';

  const { Visualizer, ContractError } = global.AlgoViz;

  /* ---------- small helpers ---------- */

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') el.className = attrs[k];
        else if (k === 'text') el.textContent = attrs[k];
        else if (k === 'html') el.innerHTML = attrs[k];
        else el.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach(function (c) {
      if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  /* ---------- icons ---------- */

  const ICONS = {
    first: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4v12M15 4 8 10l7 6z"/></svg>',
    prev: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M13 4 6 10l7 6z"/></svg>',
    play: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l9 6-9 6z"/></svg>',
    pause: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4h3v12H6zM11 4h3v12h-3z"/></svg>',
    next: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l7 6-7 6z"/></svg>',
    last: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15 4v12M5 4l7 6-7 6z"/></svg>',
  };

  /* ---------- loading ---------- */

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }

  function showProblem(root, title, items, hint) {
    root.innerHTML = '';
    const box = h('section', { class: 'pv-problem', role: 'alert' }, [
      h('h1', { text: title }),
      items && items.length ? h('ul', null, items.map(function (t) { return h('li', { text: t }); })) : null,
      hint ? h('pre', { class: 'pv-problem-hint', text: hint }) : null,
    ]);
    root.appendChild(box);
  }

  /* ---------- the player ---------- */

  function mountPlayer(opts) {
    const root = document.querySelector(opts.root);
    const params = new URLSearchParams(location.search);
    const impl = params.get('impl') || opts.defaultImpl;

    let scriptError = null;
    const onError = function (e) { scriptError = e.message; };
    window.addEventListener('error', onError);

    loadScript(impl).then(function () {
      window.removeEventListener('error', onError);
      if (scriptError) {
        return showProblem(root, impl + ' has an error', [scriptError], null);
      }
      const Cls = Visualizer.getRegistered();
      if (!Cls) {
        return showProblem(root, impl + ' loaded, but no class was registered',
          ['End the file with Visualizer.register(YourClass);'], opts.contractHint);
      }
      let result;
      try {
        result = Visualizer.run(Cls);
      } catch (e) {
        if (e instanceof ContractError) {
          return showProblem(root, Cls.name + ' doesn\u2019t match the ' + opts.title.toLowerCase() + ' contract',
            e.problems, opts.contractHint);
        }
        return showProblem(root, 'Running ' + Cls.name + ' failed', [String(e && e.message || e)], null);
      }
      build(root, result, impl, opts);
    }, function () {
      window.removeEventListener('error', onError);
      showProblem(root, 'Couldn\u2019t load ' + impl,
        ['Check that the file sits next to this page, or pass another file with ?impl=your-file.js'], null);
    });
  }

  function build(root, result, impl, opts) {
    const steps = result.steps;
    const n = steps.length;
    const last = n - 1;

    document.title = opts.title + ' \u2013 ' + result.Cls.name;
    root.innerHTML = '';

    const header = h('header', { class: 'pv-head' }, [
      h('h1', { text: opts.title }),
      h('p', { class: 'pv-sub' }, [
        h('code', { text: result.Cls.name }), ' from ', h('code', { text: impl }),
      ]),
    ]);

    const visual = h('div', { class: 'pv-visual', role: 'img' });

    const btn = function (name, label) {
      return h('button', { class: 'pv-btn pv-btn-' + name, type: 'button', 'aria-label': label, title: label, html: ICONS[name] });
    };
    const bFirst = btn('first', 'First step (Home)');
    const bPrev = btn('prev', 'Previous step (Left arrow)');
    const bPlay = btn('play', 'Play (Space)');
    const bNext = btn('next', 'Next step (Right arrow)');
    const bLast = btn('last', 'Last step (End)');

    const fill = h('div', { class: 'pv-scrub-fill' });
    const thumb = h('div', { class: 'pv-scrub-thumb' });
    const ticks = h('div', { class: 'pv-scrub-ticks' });
    if (n <= 80) {
      for (let k = 0; k < n; k++) {
        const tk = h('span', { class: 'pv-scrub-tick' });
        tk.style.left = (last ? k / last * 100 : 0) + '%';
        ticks.appendChild(tk);
      }
    }
    const scrub = h('div', {
      class: 'pv-scrub', role: 'slider', tabindex: '0', 'aria-label': 'Step',
      'aria-valuemin': '1', 'aria-valuemax': String(n),
    }, [h('div', { class: 'pv-scrub-track' }, [fill, ticks]), thumb]);

    const counter = h('output', { class: 'pv-counter' });
    const speedSel = h('select', { class: 'pv-speed', 'aria-label': 'Playback speed' },
      [0.5, 1, 2, 4].map(function (v) {
        const o = h('option', { value: String(v), text: v + '\u00d7' });
        if (v === 1) o.selected = true;
        return o;
      }));

    root.appendChild(header);
    root.appendChild(h('main', { class: 'pv-stage', 'aria-label': 'Visualization' }, [
      visual,
      h('div', { class: 'pv-stepper' }, [
        h('div', { class: 'pv-buttons' }, [bFirst, bPrev, bPlay, bNext, bLast]),
        scrub,
        h('div', { class: 'pv-stepper-meta' }, [counter, speedSel]),
      ]),
    ]));

    // The view draws any position on the timeline, e.g. 4.37 is 37% of the
    // way through the motion from step 4 to step 5.
    const view = opts.createView(visual, result);
    const weights = view.weights || steps.map(function () { return 1; });

    /* ---------- the playhead ----------
     * pos     where the picture is now (fractional)
     * target  the step the controls asked for (whole number)
     * Every frame pos glides toward target. The further behind it is, the
     * faster it goes, so rapid clicks speed the motion up instead of
     * cutting it off. While dragging, pos follows the pointer smoothly.
     */
    let pos = 0;
    let target = 0;
    let vel = 0;
    let speed = 1;
    let playing = false;
    let dwell = 0;
    let dragging = false;
    let pointerPos = 0;
    let lastTime = performance.now();
    let drawn = null;
    let shownStep = -1;

    const BASE_MS = 1300;   // one step with full motion, at 1x
    const DWELL_MS = 280;   // pause on each step while playing

    function stepMs(k) {
      k = Math.max(1, Math.min(last, k));
      return BASE_MS * (weights[k] == null ? 1 : weights[k]) / speed;
    }

    function draw() {
      if (drawn === pos) return;
      drawn = pos;
      view.seek(pos);
      const pct = (last ? pos / last : 0) * 100;
      fill.style.width = pct + '%';
      thumb.style.left = pct + '%';
      const near = Math.round(pos);
      if (near !== shownStep) {
        shownStep = near;
        counter.textContent = 'Step ' + (near + 1) + ' of ' + n;
        visual.setAttribute('aria-label', steps[near].message);
        scrub.setAttribute('aria-valuenow', String(near + 1));
        scrub.setAttribute('aria-valuetext', 'Step ' + (near + 1) + ' of ' + n + ': ' + steps[near].message);
      }
    }

    function renderButtons() {
      bFirst.disabled = bPrev.disabled = target === 0 && pos === 0;
      bNext.disabled = bLast.disabled = target === last && pos === last;
      bPlay.innerHTML = playing ? ICONS.pause : ICONS.play;
      bPlay.setAttribute('aria-label', playing ? 'Pause (Space)' : 'Play (Space)');
      bPlay.title = bPlay.getAttribute('aria-label');
    }

    function frame(now) {
      const dt = Math.min(50, now - lastTime);
      lastTime = now;

      if (dragging) {
        const d = pointerPos - pos;
        if (Math.abs(d) < 1e-4) pos = pointerPos;
        else pos += d * (1 - Math.exp(-dt / 55));
        vel = 0;
      } else if (pos !== target) {
        const dir = target > pos ? 1 : -1;
        const dist = Math.abs(target - pos);
        // the step whose transition is being travelled right now
        const k = dir > 0 ? Math.floor(pos) + 1 : Math.ceil(pos);
        const boost = 1 + 1.4 * Math.max(0, dist - 1);
        const desired = boost / stepMs(k);
        vel += (desired - vel) * (1 - Math.exp(-dt / 80));
        const move = Math.max(vel, desired * 0.25) * dt;
        if (move >= dist) { pos = target; vel = 0; renderButtons(); }
        else pos += dir * move;
      } else if (playing) {
        if (target >= last) stop();
        else {
          dwell += dt;
          if (dwell >= DWELL_MS / speed) { dwell = 0; target += 1; renderButtons(); }
        }
      }

      draw();
      requestAnimationFrame(frame);
    }

    function goTo(t) {
      target = Math.max(0, Math.min(last, t));
      renderButtons();
    }
    function step(delta) {
      stop();
      // count from where the motion is heading, so each click adds one step
      goTo(target + delta);
    }
    function play() {
      if (target >= last && pos >= last) { pos = target = 0; }
      playing = true;
      dwell = DWELL_MS;
      renderButtons();
    }
    function stop() {
      if (!playing) return;
      playing = false;
      renderButtons();
    }

    bFirst.addEventListener('click', function () { stop(); goTo(0); });
    bPrev.addEventListener('click', function () { step(-1); });
    bNext.addEventListener('click', function () { step(1); });
    bLast.addEventListener('click', function () { stop(); goTo(last); });
    bPlay.addEventListener('click', function () { playing ? stop() : play(); });
    speedSel.addEventListener('change', function () { speed = Number(speedSel.value); });

    /* scrubbing */
    function posAt(clientX) {
      const r = scrub.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * last;
    }
    scrub.addEventListener('pointerdown', function (e) {
      stop();
      dragging = true;
      pointerPos = posAt(e.clientX);
      scrub.setPointerCapture(e.pointerId);
      scrub.classList.add('is-dragging');
      e.preventDefault();
    });
    scrub.addEventListener('pointermove', function (e) {
      if (dragging) pointerPos = posAt(e.clientX);
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      scrub.classList.remove('is-dragging');
      if (scrub.hasPointerCapture(e.pointerId)) scrub.releasePointerCapture(e.pointerId);
      // settle on the nearest step, finishing the motion in progress
      goTo(Math.round(pointerPos));
    }
    scrub.addEventListener('pointerup', endDrag);
    scrub.addEventListener('pointercancel', endDrag);

    document.addEventListener('keydown', function (e) {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'Home') { e.preventDefault(); stop(); goTo(0); }
      else if (e.key === 'End') { e.preventDefault(); stop(); goTo(last); }
      else if (e.key === ' ' && tag !== 'BUTTON') { e.preventDefault(); playing ? stop() : play(); }
    });

    renderButtons();
    draw();
    requestAnimationFrame(function (t) { lastTime = t; frame(t); });
  }

  global.AlgoViz.mountPlayer = mountPlayer;
})(window);
