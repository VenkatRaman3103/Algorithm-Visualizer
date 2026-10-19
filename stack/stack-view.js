/*
 * stack-view.js
 * Draws a stack timeline at any fractional position. Used by stack.html and
 * embedded by other pages (the graph's DFS frontier).
 *   AlgoViz.views.stack(container, { steps }, { embedded })
 * embedded: no size line, and a pushed value pops up on the floor and hops in
 * on the same step instead of waiting there beforehand.
 */
(function () {
  'use strict';
  const format = AlgoViz.format;
  const topIndex = StackBase.topIndex;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  const { clamp01, easeIn, easeInOut, smooth, sequence, hop, crouch, squash, still, appearAt, poofAt } = AlgoViz.motion;

  /* ---------- reading the timeline ---------- */

  // The push whose value should be waiting outside after step `index`.
  function nextPush(steps, index) {
    for (let j = index + 1; j < steps.length; j++) {
      const st = steps[j];
      if (st.kind === 'sub' || st.kind === 'note') continue;
      if (st.op !== 'push') return null;
      for (let k = index + 1; k < j; k++) {
        if (steps[k].kind !== 'note' && steps[k].opIndex !== st.opIndex) return null;
      }
      return st;
    }
    return null;
  }

  /*
   * Follow every value box through the whole timeline.
   * locs[k]  : Map box id -> { at: 'slot', i } | { at: 'wait' }  after step k
   * moves[k] : Map box id -> how it got from step k-1 to step k
   *            push | pop | reject | appear | vanish | fadeIn | fadeOut
   * Slot contents are always checked against the recorded snapshot, so
   * the picture shows what the dev's code really did.
   */
  function analyse(steps, opts) {
    const embedded = !!(opts && opts.embedded);
    // how a value is written on its box; a host page can pass its own
    const format = (opts && opts.format) || AlgoViz.format;
    const boxes = [];
    const locs = [];
    const moves = [];
    const cur = new Map();
    const slotOf = [];
    const waitingFor = new Map();

    function newBox(text) {
      const b = { id: boxes.length, text: text };
      boxes.push(b);
      return b.id;
    }

    function syncWaiting(k, mv) {
      if (embedded) return;
      const up = nextPush(steps, k);
      waitingFor.forEach(function (id, op) {
        if (!up || up.opIndex !== op) {
          if (cur.has(id)) { cur.delete(id); mv.set(id, 'vanish'); }
          waitingFor.delete(op);
        }
      });
      if (up && !waitingFor.has(up.opIndex)) {
        const id = newBox(format(up.args[0]));
        waitingFor.set(up.opIndex, id);
        cur.set(id, { at: 'wait' });
        mv.set(id, 'appear');
      }
    }

    function reconcile(st, mv) {
      const s = st.snapshot;
      const items = Array.isArray(s.items) ? s.items : [];
      const t = topIndex(s);
      const pushing = st.kind === 'sub' && st.op === 'push';
      const span = Math.max(slotOf.length, t + 1);
      for (let i = 0; i < span; i++) {
        const want = i <= t && !(pushing && i === t) && (i in items) && items[i] !== undefined;
        const text = want ? format(items[i]) : null;
        let id = slotOf[i];
        if (id != null && (!want || boxes[id].text !== text)) {
          cur.delete(id);
          slotOf[i] = undefined;
          if (!mv.has(id)) mv.set(id, 'fadeOut');
          id = null;
        }
        if (want && id == null) {
          const nid = newBox(text);
          cur.set(nid, { at: 'slot', i: i });
          slotOf[i] = nid;
          mv.set(nid, 'fadeIn');
        }
      }
    }

    const first = new Map();
    reconcile(steps[0], first);
    syncWaiting(0, first);
    locs.push(new Map(cur));
    moves.push(new Map());

    for (let k = 1; k < steps.length; k++) {
      const st = steps[k];
      const hl = st.highlight || {};
      const mv = new Map();

      if (st.kind === 'op' && st.op === 'push' && hl.kind === 'added' && waitingFor.has(st.opIndex)) {
        const id = waitingFor.get(st.opIndex);
        waitingFor.delete(st.opIndex);
        // the box lands in its slot, carrying what the code stored there
        const items = st.snapshot.items || [];
        boxes[id].text = (hl.index in items) ? format(items[hl.index]) : boxes[id].text;
        cur.set(id, { at: 'slot', i: hl.index });
        slotOf[hl.index] = id;
        mv.set(id, 'push');
      } else if (embedded && st.kind === 'op' && st.op === 'push' && hl.kind === 'added') {
        // embedded: the value pops up on the floor and hops in, all in this move
        const items = st.snapshot.items || [];
        const id = newBox((hl.index in items) ? format(items[hl.index]) : format(st.args[0]));
        cur.set(id, { at: 'slot', i: hl.index });
        slotOf[hl.index] = id;
        mv.set(id, 'arrive');
      } else if (st.kind === 'op' && st.op === 'pop' && hl.kind === 'removed' && slotOf[hl.index] != null) {
        const id = slotOf[hl.index];
        slotOf[hl.index] = undefined;
        cur.delete(id);
        mv.set(id, 'pop');
      } else if (st.kind === 'error' && st.op === 'push' && waitingFor.has(st.opIndex)) {
        const id = waitingFor.get(st.opIndex);
        waitingFor.delete(st.opIndex);
        cur.delete(id);
        mv.set(id, 'reject');
      }

      reconcile(st, mv);
      syncWaiting(k, mv);
      locs.push(new Map(cur));
      moves.push(mv);
    }

    // How long each move takes, relative to a full jump.
    const weights = moves.map(function (mv, k) {
      if (k === 0) return 0;
      let w = 0.35;
      mv.forEach(function (m) {
        if (m === 'push' || m === 'arrive' || m === 'pop' || m === 'reject') w = 1;
        else w = Math.max(w, 0.55);
      });
      const st = steps[k];
      if ((st.kind === 'error' || st.kind === 'fatal') && w < 0.55) w = 0.55;
      if (st.highlight && st.highlight.kind === 'read') w = Math.max(w, 0.6);
      return w;
    });

    return { boxes: boxes, locs: locs, moves: moves, weights: weights };
  }

  /* ---------- the view ---------- */

  function createStackView(container, result, opts) {
    const embedded = !!(opts && opts.embedded);
    const steps = result.steps;
    const last = steps.length - 1;
    const model = analyse(steps, opts);

    let maxT = -1;
    let cap = null;
    steps.forEach(function (st) {
      maxT = Math.max(maxT, topIndex(st.snapshot));
      const c = st.snapshot.capacity;
      if (cap == null && Number.isInteger(c) && c > 0) cap = c;
    });
    const slots = Math.max(1, cap ? Math.max(cap, maxT + 1) : maxT + 2);

    const wrap = el('div', 'st');
    const meta = el('dl', 'st-meta');
    const metaVals = {};
    ['size', 'top', 'capacity'].forEach(function (k) {
      const d = el('div');
      d.appendChild(el('dt', null, k));
      metaVals[k] = el('dd');
      d.appendChild(metaVals[k]);
      meta.appendChild(d);
    });
    metaVals.capacity.textContent = cap ? String(cap) : 'no limit';
    if (!embedded) wrap.appendChild(meta);

    const scene = el('div', 'st-scene');
    scene.appendChild(el('div', 'st-ground'));
    const slotEls = [];
    let ptrCell = null;
    for (let i = slots - 1; i >= 0; i--) {
      const row = el('div', 'st-row' + (i === 0 ? ' is-bottom' : ''));
      const lane = el('div', 'st-lane');
      const slot = el('div', 'st-slot' + (cap ? ' has-cap' : ''));
      slotEls[i] = slot;
      lane.appendChild(slot);
      row.appendChild(lane);
      row.appendChild(el('span', 'st-index', String(i)));
      const pc = el('span');
      if (i === 0) ptrCell = pc;
      row.appendChild(pc);
      scene.appendChild(row);
    }

    const pointer = el('div', 'st-pointer', 'top');
    scene.appendChild(pointer);

    const boxEls = model.boxes.map(function (b) {
      const e = el('div', 'st-box', b.text);
      e.style.visibility = 'hidden';
      scene.appendChild(e);
      return e;
    });

    wrap.appendChild(scene);
    container.appendChild(wrap);

    /* geometry, in scene px */
    let G = null;
    function measure() {
      const BOX_W = slotEls[0].offsetWidth;
      const BOX_H = slotEls[0].offsetHeight;
      const slotAt = slotEls.map(function (sl) { return { x: sl.offsetLeft, y: sl.offsetTop }; });
      const topRow = slotAt[slots - 1].y;
      const ground = slotAt[0].y + 10;            // box top when standing on the floor
      const above = topRow - 4 - BOX_H - 24;       // hovering over the opening
      G = {
        w: BOX_W,
        h: BOX_H,
        slot: slotAt,
        inSpot: { x: scene.clientWidth - BOX_W - 8, y: ground },
        outSpot: { x: 8, y: ground },
        peak: above - 44,
        perch: { x: slotAt[0].x, y: topRow - 4 - BOX_H - 2 },
        ptrX: ptrCell.offsetLeft,
        ptrY: function (t) {
          return t >= 0 ? slotAt[t].y + BOX_H / 2 - 9 : slotAt[0].y + BOX_H + 6;
        },
      };
      boxEls.forEach(function (e) { e.style.width = BOX_W + 'px'; });
      motions.clear();
    }

    /* motions are built once per (box, step) and reused while seeking */
    const motions = new Map();
    function motionFor(id, k, kind, from, to) {
      const key = id + ':' + k;
      let m = motions.get(key);
      if (m) return m;
      const g = G;
      if (kind === 'push' || kind === 'arrive') {
        const dest = g.slot[to.i];
        m = sequence((kind === 'arrive' ? [[0.16, appearAt(g.inSpot)]] : []).concat([
          [0.13, crouch(g.inSpot, 0.14)],
          [0.62, hop(g.inSpot, dest, g.peak, 0.42, 0.02, 0.62)],
          [0.17, squash(dest, 0.07)],
          [0.08, still(dest)],
        ]));
      } else if (kind === 'pop') {
        const src = g.slot[from.i];
        m = sequence([
          [0.11, crouch(src, 0.06)],
          [0.58, hop(src, g.outSpot, g.peak, 0.5, 0.36, 0.95)],
          [0.15, squash(g.outSpot, 0.12)],
          [0.16, poofAt(g.outSpot)],
        ]);
      } else if (kind === 'reject') {
        const perch = g.perch;
        m = sequence([
          [0.1, crouch(g.inSpot, 0.14)],
          [0.32, hop(g.inSpot, perch, g.peak, 0.55, 0.05, 0.8)],
          [0.16, function (u) {
            const k2 = Math.sin(u * Math.PI * 4) * (1 - u);
            const c = Math.cos(u * Math.PI * 3) * (1 - u);
            return { x: perch.x + 6 * k2, y: perch.y, r: 5 * k2, sx: 1 + 0.06 * c, sy: 1 - 0.08 * c };
          }],
          [0.26, hop(perch, g.inSpot, g.peak + 20, 0.35, 0, 0.8)],
          [0.06, squash(g.inSpot, 0.12)],
          [0.1, poofAt(g.inSpot)],
        ]);
      }
      motions.set(key, m);
      return m;
    }

    function restPose(loc) {
      const p = loc.at === 'wait' ? G.inSpot : G.slot[loc.i];
      return { x: p.x, y: p.y };
    }

    function hasBigMove(mv) {
      let big = false;
      mv.forEach(function (m) { if (m === 'push' || m === 'arrive' || m === 'pop' || m === 'reject') big = true; });
      return big;
    }

    function apply(e, pose, cls) {
      if (!pose) {
        if (e.style.visibility !== 'hidden') e.style.visibility = 'hidden';
        return;
      }
      const sx = pose.sx == null ? 1 : pose.sx;
      const sy = pose.sy == null ? 1 : pose.sy;
      const r = pose.r || 0;
      const o = pose.o == null ? 1 : pose.o;
      e.style.transform = 'translate3d(' + pose.x.toFixed(2) + 'px,' + pose.y.toFixed(2) + 'px,0) rotate(' +
        r.toFixed(2) + 'deg) scale(' + sx.toFixed(3) + ',' + sy.toFixed(3) + ')';
      e.style.opacity = o.toFixed(3);
      if (e.style.visibility !== 'visible') e.style.visibility = 'visible';
      const full = 'st-box' + (cls ? ' ' + cls : '');
      if (e.className !== full) e.className = full;
    }

    function seek(pos) {
      if (!G) measure();
      pos = Math.max(0, Math.min(last, pos));
      let k = Math.floor(pos);
      let f = pos - k;
      if (k >= last) { k = last; f = 0; }
      const near = f >= 0.5 ? k + 1 : k;
      const nearStep = steps[near];
      const nearHl = nearStep.highlight || {};
      const A = model.locs[k];
      const B = f > 0 ? model.locs[k + 1] : null;
      const mv = f > 0 ? model.moves[k + 1] : null;
      const into = f > 0 ? steps[k + 1] : null;
      const big = mv ? hasBigMove(mv) : false;

      boxEls.forEach(function (e, id) {
        const a = A.get(id);
        const how = mv && mv.get(id);
        let pose = null;
        let cls = '';

        if (how === 'push' || how === 'arrive' || how === 'pop' || how === 'reject') {
          pose = motionFor(id, k + 1, how, a, B.get(id))(f);
          cls = 'is-flying ' + (how === 'push' || how === 'arrive' ? 'hl-added' : how === 'pop' ? 'is-out' : 'is-rejected');
        } else if (how === 'appear') {
          // a new value arrives on the floor once the jump in this move is done
          const u = big ? (f - 0.72) / 0.28 : f;
          pose = u <= 0 ? null : appearAt(G.inSpot)(u);
        } else if (how === 'vanish') {
          const u = big ? f / 0.3 : f;
          pose = u >= 1 ? null : poofAt(restPose(a))(u);
        } else if (how === 'fadeIn') {
          pose = Object.assign(restPose(B.get(id)), { o: smooth(f) });
        } else if (how === 'fadeOut') {
          pose = Object.assign(restPose(a), { o: 1 - smooth(f) });
        } else if (a) {
          pose = restPose(a);
          if (a.at === 'slot') {
            // peek: the top box hops in place
            if (into && into.highlight && into.highlight.kind === 'read' && into.highlight.index === a.i) {
              const hopU = Math.sin(Math.PI * clamp01(f / 0.7));
              pose.y -= 12 * hopU;
              pose.sy = 1 + 0.04 * hopU;
              pose.sx = 1 - 0.03 * hopU;
            }
            if (nearHl.index === a.i && nearHl.kind && nearHl.kind !== 'removed' && nearHl.kind !== 'focus') {
              cls = 'hl-' + nearHl.kind;
            }
          }
        }
        apply(e, pose, cls);
      });

      // empty-slot highlight for sub-steps that point at a slot
      slotEls.forEach(function (sl, i) {
        const on = nearHl.kind === 'focus' && nearHl.index === i;
        if (sl.classList.contains('hl-focus') !== on) sl.classList.toggle('hl-focus', on);
      });

      // the top pointer glides between slots
      const tA = topIndex(steps[k].snapshot);
      const tB = f > 0 ? topIndex(steps[k + 1].snapshot) : tA;
      const py = G.ptrY(tA) + (G.ptrY(tB) - G.ptrY(tA)) * easeInOut(f);
      pointer.style.transform = 'translate3d(' + G.ptrX + 'px,' + py.toFixed(2) + 'px,0)';
      const tNear = topIndex(nearStep.snapshot);
      const isErr = nearStep.kind === 'error' || nearStep.kind === 'fatal';
      const pText = tNear >= 0 ? 'top' : 'top = ' + tNear;
      if (pointer.textContent !== pText) pointer.textContent = pText;
      const pCls = 'st-pointer' + (tNear < 0 ? ' is-below' : '') + (isErr ? ' is-error' : '');
      if (pointer.className !== pCls) pointer.className = pCls;

      // an error with nothing to jump (pop on empty) shakes the stack
      let shake = 0;
      if (into && (into.kind === 'error' || into.kind === 'fatal') && !big) {
        shake = 9 * Math.sin(f * Math.PI * 6) * (1 - f);
      }
      scene.style.transform = shake ? 'translateX(' + shake.toFixed(2) + 'px)' : '';

      metaVals.size.textContent = String(tNear + 1);
      metaVals.top.textContent = String(tNear);
      lastPos = pos;
    }

    let lastPos = 0;
    if (window.ResizeObserver) {
      new ResizeObserver(function () { G = null; seek(lastPos); }).observe(scene);
    }

    return { seek: seek, weights: model.weights };
  }

  AlgoViz.views = AlgoViz.views || {};
  AlgoViz.views.stack = createStackView;
})();
