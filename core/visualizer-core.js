/*
 * visualizer-core.js
 * Generic recording engine. Knows nothing about stacks.
 *
 * A structure base (e.g. StackBase) extends Visualizable and declares a
 * static `spec` describing its contract. The dev extends that base, writes a
 * static `scenario(instance)` and calls Visualizer.register(TheirClass).
 *
 * The engine runs the scenario once and records a timeline of steps:
 *   init  - state right after construction
 *   sub   - a this.step(...) call inside a tracked method
 *   op    - a tracked method finished normally
 *   error - a tracked method threw (scenario continues)
 *   note  - instance.step(...) called from the scenario itself
 *   fatal - scenario code itself threw, or the step limit was hit
 */
(function (global) {
  'use strict';

  const MAX_STEPS = 2000;
  const recorders = new WeakMap();

  class StepLimitError extends Error {
    constructor() {
      super('Step limit of ' + MAX_STEPS + ' reached. Check the scenario for an endless loop.');
    }
  }

  class ContractError extends Error {
    constructor(problems) {
      super(problems.join('\n'));
      this.problems = problems;
    }
  }

  function clone(value) {
    try {
      return structuredClone(value);
    } catch (_) {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (__) {
        return String(value);
      }
    }
  }

  // Snapshot every own, enumerable, non-function field of the instance.
  function snapshot(instance) {
    const out = {};
    for (const key of Object.keys(instance)) {
      const v = instance[key];
      if (typeof v === 'function') continue;
      out[key] = clone(v);
    }
    return out;
  }

  // Human-readable value formatting, used by messages and the fields panel.
  function format(value, depth) {
    depth = depth || 0;
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value !== 'object') return String(value);
    if (depth > 3) return Array.isArray(value) ? '[…]' : '{…}';
    if (Array.isArray(value)) {
      const parts = [];
      for (let i = 0; i < value.length; i++) {
        parts.push(i in value ? format(value[i], depth + 1) : 'empty');
      }
      return '[' + parts.join(', ') + ']';
    }
    const entries = Object.keys(value).map(function (k) {
      return k + ': ' + format(value[k], depth + 1);
    });
    return '{ ' + entries.join(', ') + ' }';
  }

  function normalizeHighlight(h) {
    if (h == null) return null;
    if (typeof h === 'number') return { index: h, kind: 'focus' };
    if (typeof h === 'object') return Object.assign({ kind: 'focus' }, h);
    return null;
  }

  class Recorder {
    constructor(instance, spec) {
      this.instance = instance;
      this.spec = spec;
      this.steps = [];
      this.depth = 0;
      this.current = null;
      this.opCount = 0;
    }

    add(step, force) {
      if (!force && this.steps.length >= MAX_STEPS) throw new StepLimitError();
      step.id = this.steps.length;
      this.steps.push(step);
    }

    // A structure can take its own snapshot (e.g. to keep node identity) and
    // encode what a highlight or a return value points at.
    snap() {
      return this.spec.snapshot ? this.spec.snapshot(this.instance) : snapshot(this.instance);
    }

    subStep(message, highlight) {
      // encode the highlight first: it can name objects the snapshot should include
      const hl = normalizeHighlight(this.spec.encodeHighlight ? this.spec.encodeHighlight(highlight) : highlight);
      const base = {
        message: String(message),
        highlight: hl,
        snapshot: this.snap(),
      };
      if (this.current) {
        this.add(Object.assign(base, {
          kind: 'sub',
          opIndex: this.current.index,
          op: this.current.op,
          args: this.current.args,
        }));
      } else if (this.depth === 0) {
        this.add(Object.assign(base, { kind: 'note', opIndex: null, op: null }));
      }
    }

    wrap(name) {
      const rec = this;
      const inst = this.instance;
      const original = inst[name];
      Object.defineProperty(inst, name, {
        configurable: true,
        enumerable: false,
        writable: true,
        value: function () {
          const args = Array.prototype.slice.call(arguments);
          // Calls made from inside another tracked method (e.g. pop -> isEmpty)
          // are implementation details: run them without recording.
          if (rec.depth > 0) return original.apply(this, args);

          const call = { index: rec.opCount++, op: name, args: clone(args) };
          rec.current = call;
          rec.depth++;
          let result;
          let error = null;
          try {
            result = original.apply(this, args);
          } catch (e) {
            if (e instanceof StepLimitError) throw e;
            error = e;
          } finally {
            rec.depth--;
            rec.current = null;
          }

          const after = rec.snap();
          const errorText = error ? (error && error.message ? error.message : String(error)) : null;
          const info = rec.spec.describe({
            op: name,
            args: call.args,
            result: result,
            error: errorText,
            snapshot: after,
          }) || {};

          rec.add({
            kind: error ? 'error' : 'op',
            opIndex: call.index,
            op: name,
            args: call.args,
            result: error ? undefined : (rec.spec.encodeValue ? rec.spec.encodeValue(result) : clone(result)),
            hasResult: !error && result !== undefined,
            error: errorText,
            message: info.message || name + '()',
            highlight: normalizeHighlight(info.highlight),
            snapshot: after,
          });
          return error ? undefined : result;
        },
      });
    }
  }

  // Base class every structure base extends.
  class Visualizable {
    /**
     * Mark an intermediate state.
     * Inside a method: a sub-step of the current operation.
     * From the scenario (instance.step('...')): a note in the timeline.
     * Outside the visualizer it does nothing, so classes still run normally.
     */
    step(message, highlight) {
      const rec = recorders.get(this);
      if (rec) rec.subStep(message, highlight);
    }

  }

  function dedent(source) {
    const lines = source.replace(/\t/g, '  ').split('\n');
    if (lines.length < 2) return source;
    let min = Infinity;
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const indent = lines[i].match(/^ */)[0].length;
      if (indent < min) min = indent;
    }
    if (!isFinite(min)) return source;
    return [lines[0]].concat(lines.slice(1).map(function (l) { return l.slice(min); })).join('\n');
  }

  let registered = null;

  const Visualizer = {
    register(Cls) {
      registered = Cls;
    },

    getRegistered() {
      return registered;
    },

    run(Cls) {
      const spec = Cls && Cls.spec;
      if (typeof Cls !== 'function' || !spec || !(Cls.prototype instanceof Visualizable)) {
        throw new ContractError([
          'The registered class must extend a structure base such as StackBase.',
        ]);
      }

      const problems = [];
      if (typeof Cls.scenario !== 'function') {
        problems.push('Add a static scenario(' + spec.instanceName + ') method that calls your methods in order.');
      }
      spec.requiredMethods.forEach(function (m) {
        if (typeof Cls.prototype[m] !== 'function') {
          problems.push('Missing required method ' + m + '().');
        }
      });
      if (spec.trackOwnMethods && !Object.getOwnPropertyNames(Cls.prototype).some(function (m) {
        return m !== 'constructor' && typeof Cls.prototype[m] === 'function';
      })) {
        problems.push('Define at least one method for the scenario to call.');
      }
      if (problems.length) throw new ContractError(problems);

      let instance;
      try {
        instance = new Cls();
      } catch (e) {
        throw new ContractError(['The constructor threw: ' + (e && e.message ? e.message : e)]);
      }
      const stateProblems = spec.validateState(instance);
      if (stateProblems.length) throw new ContractError(stateProblems);

      const rec = new Recorder(instance, spec);
      recorders.set(instance, rec);

      let tracked = spec.requiredMethods.concat(
        spec.optionalMethods.filter(function (m) { return typeof Cls.prototype[m] === 'function'; })
      );
      // A structure can ask for every method the dev's class defines itself
      // to be tracked, so examples can name them freely (search, pairSum...).
      if (spec.trackOwnMethods) {
        Object.getOwnPropertyNames(Cls.prototype).forEach(function (m) {
          if (m !== 'constructor' && typeof Cls.prototype[m] === 'function' && tracked.indexOf(m) === -1) tracked.push(m);
        });
      }
      tracked.forEach(function (m) { rec.wrap(m); });

      const initial = rec.snap();
      rec.add({
        kind: 'init',
        opIndex: null,
        op: null,
        message: spec.initialMessage(initial),
        highlight: null,
        snapshot: initial,
      });

      try {
        Cls.scenario(instance);
      } catch (e) {
        rec.add({
          kind: 'fatal',
          opIndex: null,
          op: null,
          message: 'Scenario stopped: ' + (e && e.message ? e.message : e),
          highlight: null,
          snapshot: rec.snap(),
        }, true);
      }

      const sources = {};
      tracked.forEach(function (m) {
        sources[m] = dedent(Cls.prototype[m].toString());
      });

      return {
        Cls: Cls,
        spec: spec,
        steps: rec.steps,
        tracked: tracked,
        sources: sources,
        scenarioSource: dedent(Cls.scenario.toString()),
      };
    },
  };

  global.AlgoViz = Object.assign(global.AlgoViz || {}, {
    Visualizable: Visualizable,
    Visualizer: Visualizer,
    ContractError: ContractError,
    format: format,
    clone: clone,
    MAX_STEPS: MAX_STEPS,
  });
  // Short globals for dev files.
  global.Visualizable = Visualizable;
  global.Visualizer = Visualizer;
})(window);
