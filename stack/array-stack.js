// The simplest stack: lean on Array push/pop. No top field, no capacity.
// Open with: stack.html?impl=array-stack.js

class ArrayStack extends StackBase {
  items = [];

  push(value) {
    this.items.push(value);
  }

  pop() {
    if (this.isEmpty()) throw new Error('Stack underflow');
    return this.items.pop();
  }

  peek() {
    return this.items[this.items.length - 1];
  }

  isEmpty() {
    return this.items.length === 0;
  }

  static scenario(stack) {
    stack.push('a');
    stack.push('b');
    stack.push('c');
    stack.peek();
    stack.pop();
    stack.pop();
    stack.pop();
    stack.pop();
  }
}

Visualizer.register(ArrayStack);
