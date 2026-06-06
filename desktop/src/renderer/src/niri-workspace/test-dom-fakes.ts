interface FakeElement {
  children: FakeElement[];
  className: string;
  dataset: Record<string, string>;
  ownerDocument: FakeDocument;
  style: Record<string, string>;
  textContent: string;
  addEventListener(type: string, listener: EventListener): void;
  append(...nodes: FakeElement[]): void;
  dispatchEvent(event: Event): boolean;
  getContext?(kind: string): FakeCanvasContext | null;
  hasPointerCapture(pointerId: number): boolean;
  querySelector(selector: string): FakeElement | null;
  replaceChildren(...nodes: FakeElement[]): void;
  releasePointerCapture(pointerId: number): void;
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

export function createFakeHost(): HTMLElement {
  const document: FakeDocument = {
    createElement(tagName) {
      return createFakeElement(document, tagName);
    },
  };
  return createFakeElement(document, "article") as unknown as HTMLElement;
}

function createFakeElement(document: FakeDocument, tagName: string): FakeElement {
  const listeners = new Map<string, Set<EventListener>>();
  const capturedPointers = new Set<number>();
  const element: FakeElement & {
    height?: number;
    width?: number;
  } = {
    children: [],
    className: "",
    dataset: {},
    ownerDocument: document,
    style: {},
    textContent: "",
    addEventListener(type, listener) {
      const typeListeners = listeners.get(type) ?? new Set<EventListener>();
      typeListeners.add(listener);
      listeners.set(type, typeListeners);
    },
    append(...nodes) {
      this.children.push(...nodes);
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
    hasPointerCapture(pointerId) {
      return capturedPointers.has(pointerId);
    },
    querySelector(selector) {
      return findElement(this, selector);
    },
    replaceChildren(...nodes) {
      this.children = [...nodes];
    },
    releasePointerCapture(pointerId) {
      capturedPointers.delete(pointerId);
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
  const dataMatch = selector.match(/^\[data-([a-z0-9-]+)\]$/i);
  if (dataMatch) {
    return dataAttributeKey(`data-${dataMatch[1]}`) in element.dataset;
  }
  return false;
}
