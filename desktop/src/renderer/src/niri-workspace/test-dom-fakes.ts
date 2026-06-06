interface FakeElement {
  children: FakeElement[];
  className: string;
  dataset: Record<string, string>;
  ownerDocument: FakeDocument;
  style: Record<string, string>;
  textContent: string;
  append(...nodes: FakeElement[]): void;
  getContext?(kind: string): FakeCanvasContext | null;
  querySelector(selector: string): FakeElement | null;
  replaceChildren(...nodes: FakeElement[]): void;
  setAttribute(name: string, value: string): void;
}

interface FakeCanvasContext {
  clearRect(): void;
  fillRect(): void;
  fillStyle: string;
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
    append(...nodes) {
      this.children.push(...nodes);
    },
    querySelector(selector) {
      return findElement(this, selector);
    },
    replaceChildren(...nodes) {
      this.children = [...nodes];
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
        clearRect() {},
        fillRect() {},
        fillStyle: "",
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
