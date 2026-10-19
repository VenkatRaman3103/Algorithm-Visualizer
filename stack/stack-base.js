/*
 * stack-base.js
 * The contract a stack implementation must follow.
 *
 * Required fields
 *   items     array   the storage the visualizer draws
 *
 * Optional fields
 *   top       number  index of the top element. If present, only items[0..top]
 *                     count as live; anything above is drawn as stale memory.
 *                     If absent, the top is items.length - 1.
 *   capacity  number  maximum size. Draws the empty slots up to capacity.
 *
 * Required methods   push(value), pop(), peek(), isEmpty()
 * Optional methods   isFull(), size()
 *
 * Required static    scenario(stack)  calls the methods in order
 *
 * Reserved           step(message, highlight?)  provided by the base class
 */
(function (global) {
  'use strict';

  const { Visualizable, format } = global.AlgoViz;

  function topIndex(s) {
    if (typeof s.top === 'number') return s.top;
    return Array.isArray(s.items) ? s.items.length - 1 : -1;
  }

  function isOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  class StackBase extends Visualizable {}

  StackBase.topIndex = topIndex;

  StackBase.spec = {
    name: 'Stack',
    instanceName: 'stack',
    requiredMethods: ['push', 'pop', 'peek', 'isEmpty'],
    optionalMethods: ['isFull', 'size'],

    validateState(inst) {
      const problems = [];
      if (!Array.isArray(inst.items)) {
        problems.push('Declare an items field as an array, for example items = [];');
      }
      if (isOwn(inst, 'top') && typeof inst.top !== 'number') {
        problems.push('top must be a number when you declare it, for example top = -1;');
      }
      if (isOwn(inst, 'capacity') && inst.capacity != null &&
          !(Number.isInteger(inst.capacity) && inst.capacity > 0)) {
        problems.push('capacity must be a positive whole number when you declare it.');
      }
      return problems;
    },

    initialMessage(s) {
      const size = topIndex(s) + 1;
      return size === 0
        ? 'Stack created. It is empty.'
        : 'Stack created with ' + size + ' item' + (size === 1 ? '' : 's') + '.';
    },

    describe({ op, args, result, error, snapshot }) {
      const t = topIndex(snapshot);
      const size = t + 1;
      const call = op + '(' + args.map(function (a) { return format(a); }).join(', ') + ')';

      if (error) {
        return { message: call + ' threw: ' + error, highlight: { kind: 'error', index: t } };
      }
      switch (op) {
        case 'push':
          return {
            message: 'Pushed ' + format(args[0]) + '. Size is now ' + size + '.',
            highlight: { kind: 'added', index: t },
          };
        case 'pop':
          return {
            message: 'Popped ' + format(result) + '. Size is now ' + size + '.',
            highlight: { kind: 'removed', index: t + 1, value: result },
          };
        case 'peek':
          return {
            message: 'Top is ' + format(result) + '.',
            highlight: { kind: 'read', index: t },
          };
        default:
          return { message: call + ' returned ' + format(result) + '.', highlight: null };
      }
    },
  };

  global.StackBase = StackBase;
})(window);
