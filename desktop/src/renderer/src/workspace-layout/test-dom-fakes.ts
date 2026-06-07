interface FakeElement {
  __fakeRect?: FakeRect;
  childElementCount: number;
  children: FakeElement[];
  classList: {
    add(value: string): void;
    contains(value: string): boolean;
    remove(value: string): void;
  };
  className: string;
  dataset: Record<string, string>;
  ownerDocument: FakeDocument;
  parentElement: FakeElement | null;
  style: FakeStyle;
  textContent: string;
  addEventListener(type: string, listener: EventListener): void;
  append(...nodes: FakeElement[]): void;
  closest(selector: string): FakeElement | null;
  contains(node: FakeElement): boolean;
  dispatchEvent(event: Event): boolean;
  getBoundingClientRect(): FakeRect;
  getContext?(kind: string): FakeCanvasContext | null;
  hasPointerCapture(pointerId: number): boolean;
  querySelector(selector: string): FakeElement | null;
  replaceChildren(...nodes: FakeElement[]): void;
  releasePointerCapture(pointerId: number): void;
  removeAttribute(name: string): void;
  removeEventListener(type: string, listener: EventListener): void;
  setPointerCapture(pointerId: number): void;
  setAttribute(name: string, value: string): void;
}

interface FakeCanvasContext {
  beginPath(): void;
  clearRect(): void;
  fillRect(): void;
  fillStyle: string;
  lineTo(): void;
  lineWidth: number;
  moveTo(): void;
  restore(): void;
  save(): void;
  scale(): void;
  stroke(): void;
  strokeStyle: string;
  translate(): void;
}

interface FakeDocument {
  createElement(tagName: string): FakeElement;
}

interface FakeStyle {
  visibility?: string;
  getPropertyValue(name: string): string;
  setProperty(name: string, value: string): void;
}

interface FakeRect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
  x: number;
  y: number;
}

export function createFakeHost(): HTMLElement {
  const document: FakeDocument = {
    createElement(tagName) {
      return createFakeElement(document, tagName);
    },
  };
  return createFakeElement(document, "article") as unknown as HTMLElement;
}

export function setFakeRect(
  element: HTMLElement,
  rect: { height: number; width: number; x: number; y: number },
): void {
  (element as unknown as { __fakeRect: FakeRect }).__fakeRect = fakeRect(rect);
}

function createFakeElement(document: FakeDocument, tagName: string): FakeElement {
  const classNames = new Set<string>();
  const listeners = new Map<string, Set<EventListener>>();
  const capturedPointers = new Set<number>();
  const styleProperties = new Map<string, string>();
  const element: FakeElement & {
    height?: number;
    width?: number;
  } = {
    children: [],
    classList: {
      add(value) {
        classNames.add(value);
      },
      contains(value) {
        return classNames.has(value);
      },
      remove(value) {
        classNames.delete(value);
      },
    },
    get childElementCount() {
      return this.children.length;
    },
    get className() {
      return [...classNames].join(" ");
    },
    set className(value: string) {
      classNames.clear();
      for (const className of value.split(/\s+/u)) {
        if (className.length > 0) {
          classNames.add(className);
        }
      }
    },
    dataset: {},
    ownerDocument: document,
    parentElement: null,
    style: {
      getPropertyValue(name) {
        return styleProperties.get(name) ?? "";
      },
      setProperty(name, value) {
        styleProperties.set(name, value);
      },
    },
    textContent: "",
    addEventListener(type, listener) {
      const typeListeners = listeners.get(type) ?? new Set<EventListener>();
      typeListeners.add(listener);
      listeners.set(type, typeListeners);
    },
    append(...nodes) {
      for (const node of nodes) {
        node.parentElement = this;
      }
      this.children.push(...nodes);
    },
    closest(selector) {
      return closestFakeElement(this, selector);
    },
    contains(node) {
      return containsFakeElement(this, node);
    },
    dispatchEvent(event) {
      const typeListeners = listeners.get(event.type);
      if (!typeListeners) {
        return true;
      }
      for (const listener of typeListeners) {
        listener.call(this as unknown as EventTarget, event);
      }
      return !event.defaultPrevented;
    },
    getBoundingClientRect() {
      return this.__fakeRect ?? fakeRect({ height: 0, width: 0, x: 0, y: 0 });
    },
    hasPointerCapture(pointerId) {
      return capturedPointers.has(pointerId);
    },
    querySelector(selector) {
      return findElement(this, selector);
    },
    replaceChildren(...nodes) {
      for (const child of this.children) {
        child.parentElement = null;
      }
      for (const node of nodes) {
        node.parentElement = this;
      }
      this.children = [...nodes];
    },
    releasePointerCapture(pointerId) {
      capturedPointers.delete(pointerId);
    },
    removeAttribute(name) {
      if (name.startsWith("data-")) {
        delete this.dataset[dataAttributeKey(name)];
      }
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    setPointerCapture(pointerId) {
      capturedPointers.add(pointerId);
    },
    setAttribute(name, value) {
      if (name.startsWith("data-")) {
        this.dataset[dataAttributeKey(name)] = value;
      }
    },
  };

  if (tagName === "canvas") {
    element.height = 1;
    element.width = 1;
    element.getContext = (kind: string) => {
      if (kind !== "2d") {
        return null;
      }
      return {
        beginPath() {},
        clearRect() {},
        fillRect() {},
        fillStyle: "",
        lineTo() {},
        lineWidth: 1,
        moveTo() {},
        restore() {},
        save() {},
        scale() {},
        stroke() {},
        strokeStyle: "",
        translate() {},
      };
    };
  }

  return element;
}

function closestFakeElement(element: FakeElement, selector: string): FakeElement | null {
  let current: FakeElement | null = element;
  while (current) {
    if (matchesSelector(current, selector)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function containsFakeElement(root: FakeElement, node: FakeElement): boolean {
  if (root === node) {
    return true;
  }
  return root.children.some((child) => containsFakeElement(child, node));
}

function fakeRect({
  height,
  width,
  x,
  y,
}: {
  height: number;
  width: number;
  x: number;
  y: number;
}): FakeRect {
  return {
    bottom: y + height,
    height,
    left: x,
    right: x + width,
    top: y,
    width,
    x,
    y,
  };
}

function dataAttributeKey(name: string): string {
  return name
    .replace(/^data-/, "")
    .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function findElement(element: FakeElement, selector: string): FakeElement | null {
  if (matchesSelector(element, selector)) {
    return element;
  }
  for (const child of element.children) {
    const match = findElement(child, selector);
    if (match) {
      return match;
    }
  }
  return null;
}

function matchesSelector(element: FakeElement, selector: string): boolean {
  const exactDataMatch = selector.match(/^\[data-([a-z0-9-]+)="([^"]+)"\]$/i);
  if (exactDataMatch) {
    return element.dataset[dataAttributeKey(`data-${exactDataMatch[1]}`)] === exactDataMatch[2];
  }
  const dataMatch = selector.match(/^\[data-([a-z0-9-]+)\]$/i);
  if (dataMatch) {
    return dataAttributeKey(`data-${dataMatch[1]}`) in element.dataset;
  }
  return false;
}
