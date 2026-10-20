/*
 * formula.js
 * A formula line, shared by any page that works something out: the symbols,
 * then the numbers that fly into it, then the result. The page flies the
 * numbers (it knows where they come from); this builds the line, lights the
 * winning term, and says where the slots are and when each one fills.
 *
 *   const F = AlgoViz.formula.create(hostElement);
 *   F.show(spec)          build the line for a spec (rebuilds when spec.key changes);
 *                         F.show(null) clears it
 *   F.progress(fin)       fin runs 0..1 through the step: slots fill, the winning
 *                         term lights up, the result appears
 *   F.slotEl(i)           the i-th number's slot (where its chip lands)
 *   F.resultEl()          the result (where the finished value drops from)
 *   F.timing              { slot(i) -> [start, end], result: [start, end] } for chips
 *
 * spec: {
 *   key,                       any value that changes with the step
 *   target: 'current',         what is being worked out
 *   combine: 'max' | 'min' | 'sum',   max/min pick one term; sum adds the terms
 *   note: 'extend the run',    a short pill above the formula (optional)
 *   terms: [[part, ...], ...], each term is parts added together
 *   value,                     the result
 * }
 * part: { name, value }              a number with a name
 *       { name, value, minus: true } subtracted
 *       { plus: n, label? }          a plain number added (label shown in the symbols)
 */
(function (global) {
  'use strict';

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function show(v) {
    if (v === Infinity) return '\u221e';
    if (v === -Infinity) return '-\u221e';
    if (v == null) return '\u2013';
    return global.AlgoViz && global.AlgoViz.format ? global.AlgoViz.format(v) : String(v);
  }

  const isConst = function (p) { return p && typeof p === 'object' && 'plus' in p; };

  function create(host) {
    const root = el('div', 'fm');
    host.appendChild(root);

    let builtKey = null;
    let spec = null;
    let slots = [];
    let slotTerm = [];
    let resultEl = null;
    let winner = -1;

    const timing = {
      slot: function (i) { return [0.1 + 0.05 * i, 0.45 + 0.05 * i]; },
      result: [0.62, 0.9],
      resultOn: 0.58,
      winnerOn: 0.55,
    };

    function termTotal(term) {
      return term.reduce(function (a, p) { return a + (isConst(p) ? p.plus : (p.minus ? -1 : 1) * p.value); }, 0);
    }

    function build(sp) {
      root.innerHTML = '';
      slots = [];
      slotTerm = [];
      resultEl = null;
      winner = -1;
      spec = sp;
      if (!sp) return;
      const alt = sp.combine === 'max' || sp.combine === 'min';
      if (alt) {
        for (let t = 0; t < sp.terms.length; t++) if (termTotal(sp.terms[t]) === sp.value) { winner = t; break; }
      }
      if (sp.note) root.appendChild(el('div', 'fm-note', sp.note));
      const op = function (t) { return el('span', 'fm-op', t); };

      // line one is the symbols; line two is the numbers, in slots they fly into
      const row = function (numeric) {
        const r = el('div', 'fm-row');
        if (!numeric) {
          r.appendChild(el('span', 'fm-target', sp.target));
          r.appendChild(op(' = '));
        } else {
          r.appendChild(op('= '));
        }
        if (alt) r.appendChild(op(sp.combine + '('));
        sp.terms.forEach(function (term, ti) {
          if (ti) r.appendChild(op(alt ? ', ' : ' + '));
          term.forEach(function (p, pi) {
            if (isConst(p)) {
              r.appendChild(op((pi ? ' + ' : '') + (numeric || p.label == null ? show(p.plus) : p.label)));
              return;
            }
            if (pi) r.appendChild(op(p.minus ? ' \u2212 ' : ' + '));
            else if (p.minus) r.appendChild(op('\u2212'));
            // a negative number after an operator is wrapped: 1 + (-3)
            const wrapped = numeric && pi > 0 && typeof p.value === 'number' && p.value < 0;
            if (wrapped) r.appendChild(op('('));
            if (!numeric) {
              r.appendChild(el('span', 'fm-sym', p.name));
            } else {
              const s = el('span', 'fm-slot is-empty', show(p.value));
              r.appendChild(s);
              slots.push(s);
              slotTerm.push(ti);
            }
            if (wrapped) r.appendChild(op(')'));
          });
        });
        if (alt) r.appendChild(op(')'));
        if (numeric) {
          r.appendChild(op(' = '));
          resultEl = el('span', 'fm-result is-empty', show(sp.value));
          r.appendChild(resultEl);
        }
        return r;
      };
      root.appendChild(row(false));
      root.appendChild(row(true));
    }

    function showSpec(sp) {
      const key = sp ? sp.key : null;
      if (key === builtKey && (!!spec) === (!!sp)) return;
      builtKey = key;
      build(sp);
    }

    function progress(fin) {
      if (!spec) return;
      slots.forEach(function (s, i) {
        const landed = fin >= timing.slot(i)[1];
        let cls = 'fm-slot' + (landed ? '' : ' is-empty');
        if (landed && winner !== -1 && fin >= timing.winnerOn) cls += slotTerm[i] === winner ? ' is-win' : ' is-lose';
        if (s.className !== cls) s.className = cls;
      });
      if (resultEl) {
        const cls = 'fm-result' + (fin >= timing.resultOn ? '' : ' is-empty');
        if (resultEl.className !== cls) resultEl.className = cls;
      }
    }

    return {
      root: root,
      show: showSpec,
      progress: progress,
      slotEl: function (i) { return slots[i]; },
      resultEl: function () { return resultEl; },
      timing: timing,
    };
  }

  global.AlgoViz = global.AlgoViz || {};
  global.AlgoViz.formula = { create: create, show: show };
})(window);
