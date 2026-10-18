/*
 * motion.js
 * Cartoon motion shared by every structure view.
 * A pose is { x, y, sx, sy, r, o }: position in px, scale, rotation (deg)
 * and opacity. A motion is a function u (0..1) -> pose, so a view can draw
 * any fraction of a move, which is what makes scrubbing smooth.
 */
(function (global) {
  'use strict';

  const clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  const easeOut = function (u) { return 1 - (1 - u) * (1 - u); };
  const easeIn = function (u) { return u * u; };
  const easeInOut = function (u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; };
  const smooth = function (u) { return u * u * (3 - 2 * u); };

  // A sequence of [share, motion] played one after another.
  function sequence(parts) {
    const total = parts.reduce(function (a, p) { return a + p[0]; }, 0);
    return function (u) {
      let at = clamp01(u) * total;
      for (let i = 0; i < parts.length; i++) {
        const len = parts[i][0];
        if (at <= len || i === parts.length - 1) return parts[i][1](len ? clamp01(at / len) : 1);
        at -= len;
      }
    };
  }

  // A hop from a to b over peakY. Sideways travel happens during [x0, x1]
  // of the hop, so the box clears the container walls first.
  function hop(a, b, peakY, apex, x0, x1) {
    return function (u) {
      const y = u < apex
        ? a.y + (peakY - a.y) * easeOut(u / apex)
        : peakY + (b.y - peakY) * easeIn((u - apex) / (1 - apex));
      const xu = easeInOut(clamp01((u - x0) / (x1 - x0)));
      const stretch = 0.1 * Math.abs(u - apex) / Math.max(apex, 1 - apex);
      return {
        x: a.x + (b.x - a.x) * xu,
        y: y,
        sx: 1 - stretch,
        sy: 1 + stretch,
        r: (b.x < a.x ? 1 : -1) * 9 * Math.sin(Math.PI * u),
      };
    };
  }

  function crouch(at, amount) {
    return function (u) {
      const k = Math.sin(u * Math.PI / 2);
      return { x: at.x, y: at.y, sx: 1 + amount * k, sy: 1 - amount * 1.4 * k };
    };
  }

  // springy wobble after landing; starts squashed, settles at 1
  function squash(at, amount) {
    return function (u) {
      const k = Math.cos(u * Math.PI * 2.5) * (1 - u);
      return { x: at.x, y: at.y, sx: 1 + amount * k, sy: 1 - amount * 1.3 * k };
    };
  }

  function still(at, extra) {
    return function (u) { return Object.assign({ x: at.x, y: at.y }, extra ? extra(u) : null); };
  }

  function appearAt(at) {
    return function (u) {
      const a = clamp01(u);
      // overshoot then settle
      const c1 = 1.9, c3 = c1 + 1;
      const s = a === 0 ? 0 : 1 + c3 * Math.pow(a - 1, 3) + c1 * Math.pow(a - 1, 2);
      return { x: at.x, y: at.y, sx: s * (1 + 0.12 * (1 - a)), sy: s, o: clamp01(a * 3) };
    };
  }

  function poofAt(at) {
    return function (u) {
      const k = easeIn(clamp01(u));
      return { x: at.x, y: at.y, sx: 1 + 0.3 * k, sy: Math.max(0, 1 - k), o: 1 - k };
    };
  }

  // Slide along the ground from a to b, leaning into the move.
  function slide(a, b, lean) {
    lean = lean == null ? 4 : lean;
    return function (u) {
      const e = easeInOut(clamp01(u));
      const dir = b.x < a.x ? -1 : 1;
      return {
        x: a.x + (b.x - a.x) * e,
        y: a.y + (b.y - a.y) * e,
        r: dir * lean * Math.sin(Math.PI * u),
        sx: 1 + 0.04 * Math.sin(Math.PI * u),
        sy: 1 - 0.03 * Math.sin(Math.PI * u),
      };
    };
  }

  global.AlgoViz.motion = {
    clamp01: clamp01, easeOut: easeOut, easeIn: easeIn, easeInOut: easeInOut, smooth: smooth,
    sequence: sequence, hop: hop, crouch: crouch, squash: squash, still: still,
    appearAt: appearAt, poofAt: poofAt, slide: slide,
  };
})(window);
