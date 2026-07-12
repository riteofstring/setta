import {
  syncPaneTitleElement,
  type PaneChromeIconName,
  type PaneChromeTitleModel,
} from "./pane-title-metadata";

type PaneChromeIconNode = readonly [
  tagName: "circle" | "path" | "rect",
  attributes: Readonly<Record<string, string>>,
];
type PaneChromeIconElement = Element & { dataset: DOMStringMap };

const paneChromeIconNodes = {
  chat: [
    [
      "path",
      {
        d: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
      },
    ],
  ],
  document: [
    [
      "path",
      {
        d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
      },
    ],
    ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5" }],
    ["path", { d: "M10 9H8" }],
    ["path", { d: "M16 13H8" }],
    ["path", { d: "M16 17H8" }],
  ],
  network: [
    ["rect", { height: "6", rx: "1", width: "6", x: "16", y: "16" }],
    ["rect", { height: "6", rx: "1", width: "6", x: "2", y: "16" }],
    ["rect", { height: "6", rx: "1", width: "6", x: "9", y: "2" }],
    ["path", { d: "M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" }],
    ["path", { d: "M12 12V8" }],
  ],
  settings: [
    [
      "path",
      {
        d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
      },
    ],
    ["circle", { cx: "12", cy: "12", r: "3" }],
  ],
  terminal: [
    ["path", { d: "m7 11 2-2-2-2" }],
    ["path", { d: "M11 13h4" }],
    ["rect", { height: "18", rx: "2", ry: "2", width: "18", x: "3", y: "3" }],
  ],
  workflow: [
    ["rect", { height: "8", rx: "2", width: "8", x: "3", y: "3" }],
    ["path", { d: "M7 11v4a2 2 0 0 0 2 2h4" }],
    ["rect", { height: "8", rx: "2", width: "8", x: "13", y: "13" }],
  ],
} satisfies Record<PaneChromeIconName, readonly PaneChromeIconNode[]>;

function createPaneChromeIcon(
  document: Document,
  iconName: PaneChromeIconName,
): HTMLElement | SVGElement {
  const createElementNS = (
    document as Document & {
      createElementNS?: Document["createElementNS"];
    }
  ).createElementNS;
  if (!createElementNS) {
    const fallback = document.createElement("span");
    fallback.className = "workspace-pane-title-icon";
    fallback.dataset.workspacePaneIcon = iconName;
    fallback.setAttribute("aria-hidden", "true");
    return fallback;
  }
  const svg = createElementNS.call(document, "http://www.w3.org/2000/svg", "svg") as SVGElement;
  svg.classList.add("workspace-pane-title-icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("height", "14");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "14");
  syncPaneChromeIcon(svg, iconName);
  return svg;
}

export function createPaneTitleSlot(document: Document): HTMLElement {
  const title = document.createElement("div");
  title.className = "workspace-pane-title-slot";
  title.dataset.workspacePaneTitleSlot = "true";
  title.append(createPaneChromeIcon(document, "document"), createPaneTitleText(document));
  return title;
}

function createPaneTitleText(document: Document): HTMLElement {
  const text = document.createElement("span");
  text.className = "workspace-pane-title";
  text.dataset.workspacePaneTitle = "";
  return text;
}

function paneChromeIconElement(root: ParentNode): PaneChromeIconElement | null {
  const element = childWithClass(root, "workspace-pane-title-icon");
  return isChromeIconElement(element) ? element : null;
}

export function syncPaneTitleSlot(title: HTMLElement, model: PaneChromeTitleModel): void {
  const icon = paneChromeIconElement(title);
  if (icon) {
    syncPaneChromeIcon(icon, model.icon);
  }
  syncPaneTitleElement(title, model);
}

function syncPaneChromeIcon(icon: PaneChromeIconElement, iconName: PaneChromeIconName): void {
  if (icon.dataset.workspacePaneIcon === iconName) {
    return;
  }
  icon.dataset.workspacePaneIcon = iconName;
  if (typeof SVGElement === "undefined" || !(icon instanceof SVGElement)) {
    return;
  }
  icon.replaceChildren();
  for (const [tagName, attributes] of paneChromeIconNodes[iconName]) {
    const node = icon.ownerDocument.createElementNS("http://www.w3.org/2000/svg", tagName);
    for (const [name, value] of Object.entries(attributes)) {
      node.setAttribute(name, value);
    }
    icon.append(node);
  }
}

function childWithClass(root: ParentNode, className: string): Element | null {
  const queried = root.querySelector?.(`.${className}`);
  if (queried) {
    return queried;
  }
  const children = Array.from(
    (root as ParentNode & { children?: HTMLCollectionOf<Element> | Element[] }).children ?? [],
  );
  for (const child of children) {
    if (child.classList.contains(className)) {
      return child;
    }
    const descendant = childWithClass(child, className);
    if (descendant) {
      return descendant;
    }
  }
  return null;
}

function isChromeIconElement(element: Element | null): element is PaneChromeIconElement {
  return element !== null && "dataset" in element;
}
