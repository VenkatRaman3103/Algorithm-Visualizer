// An index-based stack with a fixed capacity.

class MyStack extends StackBase {
  items = [];
  top = -1;
  capacity = 4;

  push(value) {
    if (this.isFull()) throw new Error('Stack overflow');
    this.top++;
    this.step(`top moved up to ${this.top}`, { index: this.top });
    this.items[this.top] = value;
  }

  pop() {
    if (this.isEmpty()) throw new Error('Stack underflow');
    const value = this.items[this.top];
    this.step(`read ${value} at index ${this.top}`, { index: this.top });
    this.top--;
    return value;
  }

  peek() {
    if (this.isEmpty()) throw new Error('Stack is empty');
    return this.items[this.top];
  }

  isEmpty() {
    return this.top === -1;
  }

  isFull() {
    return this.top === this.capacity - 1;
  }

  size() {
    return this.top + 1;
  }

  static scenario(stack) {
    stack.step('Push three values');
    stack.push(10);
    stack.push(20);
    stack.push(30);
    stack.peek();
    stack.pop();

    stack.step('Fill it to capacity, then push once more');
    stack.push(40);
    stack.push(50);
    stack.push(60);
  }
}

Visualizer.register(MyStack);
