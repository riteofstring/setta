/**
 * The floating label layer.
 *
 * Labels are DOM, not canvas text: they must be selectable, announceable, and
 * reachable without a pointer. They are also the only DOM the graph writes per
 * frame, so the layer is pooled and bounded — one element per *visible* label,
 * reused as the camera moves, rather than one element per durable fact. A
 * hundred-turn workstream therefore costs the same DOM as a one-turn one.
 *
 * Writes are guarded: a style or text assignment happens only when the value
 * changed, because an unchanged assignment still dirties layout.
 */

import {
  packedGraphModes,
  packedGraphOutcomes,
  packedGraphRoleCode,
  packedValueAt,
  type PackedGraphMode,
} from "../packed-graph-vocabulary";
import type { PackedGraphSnapshot } from "../packed-graph-snapshot";
import type { GraphLabelPlacement } from "./graph-labels";

/** Marks on the question and outcome pills, matching the mockup's ❯ / ✓ / ✕. */
const pillMarks = {
  question: "❯",
  running: "·",
  succeeded: "✓",
  failed: "✕",
  cancelled: "◦",
} as const;

type PillVariant = keyof typeof pillMarks;

interface PooledLabel {
  readonly element: HTMLElement;
  readonly summary: HTMLElement | null;
  readonly mark: HTMLElement | null;
  readonly title: HTMLElement | null;
  readonly status: HTMLElement | null;
  text: string;
  markText: string;
  titleText: string;
  statusText: string;
  mode: string;
  transform: string;
  translate: string;
  opacity: string;
  className: string;
  expanded: boolean | null;
  hidden: boolean;
  nodeIndex: number;
}

const tooltipStatuses = {
  think: "Thinking",
  do: "Working",
  risk: "Needs attention",
  success: "Completed",
  fail: "Failed",
  merge: "Combining work",
  listening: "Listening",
} satisfies Record<PackedGraphMode, string>;

let graphLabelLayerSequence = 0;
const emptyColumnTitles: ReadonlyMap<string, string> = new Map();

function assignText(label: PooledLabel, text: string): void {
  if (label.text === text) {
    return;
  }
  const target = label.summary ?? label.element;
  target.textContent = text;
  label.text = text;
}

function assignMark(label: PooledLabel, markText: string): void {
  if (label.mark === null || label.markText === markText) {
    return;
  }
  label.mark.textContent = markText;
  label.markText = markText;
}

function assignTitle(label: PooledLabel, text: string): void {
  if (label.title === null || label.titleText === text) {
    return;
  }
  label.title.textContent = text;
  label.titleText = text;
}

function assignStatus(label: PooledLabel, text: string): void {
  if (label.status === null || label.statusText === text) {
    return;
  }
  label.status.textContent = text;
  label.statusText = text;
}

function assignMode(label: PooledLabel, mode: PackedGraphMode): void {
  if (label.mode === mode) {
    return;
  }
  label.element.setAttribute("data-mode", mode);
  label.mode = mode;
}

function assignClassName(label: PooledLabel, value: string): void {
  if (label.className === value) {
    return;
  }
  label.element.className = value;
  label.className = value;
}

function assignOpacity(label: PooledLabel, value: string): void {
  if (label.opacity === value) {
    return;
  }
  label.element.style.opacity = value;
  label.opacity = value;
}

/*
 * `aria-expanded` says "this control shows and hides something", which is true
 * of a pill in a conversation and false of one on the Director's views, where
 * activating it goes somewhere. A navigation control that announces itself as a
 * disclosure tells a screen reader the wrong thing about what will happen.
 */
function assignExpanded(label: PooledLabel, expanded: boolean | null): void {
  if (label.expanded === expanded) {
    return;
  }
  if (expanded === null) {
    label.element.removeAttribute("aria-expanded");
  } else {
    label.element.setAttribute("aria-expanded", String(expanded));
  }
  label.expanded = expanded;
}

function className(isPill: boolean, variant: PillVariant, sticky: boolean): string {
  return [
    isPill ? "director-graph-pill" : "director-graph-label",
    isPill ? `director-graph-pill-${variant}` : "",
    sticky ? "director-graph-label-sticky" : "",
  ]
    .filter((part) => part.length > 0)
    .join(" ");
}

function assignStyle(label: PooledLabel, translate: string, transform: string): void {
  if (label.translate !== translate) {
    label.element.style.translate = translate;
    label.translate = translate;
  }
  if (label.transform !== transform) {
    label.element.style.transform = transform;
    label.transform = transform;
  }
}

export interface GraphLabelLayerCallbacks {
  /** Opens the full conversation represented by an overview title. */
  onColumnTitleActivated(workstreamId: string): void;
  /** Lets title hover/focus drive the same visual preview as its newest node. */
  onColumnTitleHovered(workstreamId: string | null): void;
  /** The user activated a question or outcome pill: fold or unfold its turn. */
  onPillActivated(nodeIndex: number): void;
  /** The focusable graph region the active tooltip describes. */
  readonly interactionRoot: HTMLElement;
}

export interface GraphColumnTitlePlacement {
  readonly key: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly tooltipX: number;
  readonly self: boolean;
  /** Pinned column headings disclose their unabridged name on hover or focus. */
  readonly pinned: boolean;
  /** A worker heading is a semantic navigation control in an overview. */
  readonly openable: boolean;
}

export interface GraphLabelFrame {
  readonly activityNodesOnly?: boolean;
  readonly count: number;
  readonly foldable: boolean;
  readonly hoveredNode?: number | null;
  readonly placements: readonly GraphLabelPlacement[];
  readonly snapshot: PackedGraphSnapshot;
  readonly titles?: ReadonlyMap<string, string>;
}

type FrameLabelKind = "pill" | "step" | "tooltip";

interface FrameLabelUsage {
  activeAnnouncement: string;
  activeTooltip: PooledLabel | null;
  pills: number;
  steps: number;
  tooltips: number;
}

interface LabelWriteInput {
  readonly isPill: boolean;
  readonly isTooltip: boolean;
  readonly label: PooledLabel;
  readonly placement: GraphLabelPlacement;
  readonly snapshot: PackedGraphSnapshot;
  readonly titles: ReadonlyMap<string, string>;
}

interface ActiveColumnTitle {
  readonly element: HTMLElement;
  readonly key: string;
  readonly placement: GraphColumnTitlePlacement;
}

function assignElementAttribute(element: HTMLElement, name: string, value: string): void {
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

function assignElementText(element: HTMLElement, value: string): void {
  if (element.textContent !== value) {
    element.textContent = value;
  }
}

function assignElementStyle(
  element: HTMLElement,
  property: "left" | "top" | "translate",
  value: string,
): void {
  if (element.style[property] !== value) {
    element.style[property] = value;
  }
}

function syncColumnTitleTabStop(element: HTMLElement, placement: GraphColumnTitlePlacement): void {
  if (placement.pinned || placement.openable) {
    if (element.tabIndex !== 0) {
      element.tabIndex = 0;
    }
    return;
  }
  if (element.hasAttribute("tabindex")) {
    element.removeAttribute("tabindex");
  }
}

function frameLabelKind(
  snapshot: PackedGraphSnapshot,
  placement: GraphLabelPlacement,
  foldable: boolean,
  activityNodesOnly: boolean,
  hoveredNode: number | null,
): FrameLabelKind {
  if (!foldable && placement.nodeIndex === hoveredNode) {
    return "tooltip";
  }
  const role = packedValueAt(snapshot.nodes.role, placement.nodeIndex);
  if (role === packedGraphRoleCode.outcome) {
    return "pill";
  }
  if (role === packedGraphRoleCode.input && !activityNodesOnly) {
    return "pill";
  }
  return "step";
}

function writeNodeTooltip(
  label: PooledLabel,
  snapshot: PackedGraphSnapshot,
  nodeIndex: number,
  titles: ReadonlyMap<string, string>,
): string {
  const turn = packedValueAt(snapshot.nodes.turn, nodeIndex);
  const workstreamId = snapshot.turnWorkstreamIds[turn];
  const title = workstreamId === undefined ? "Thread" : (titles.get(workstreamId) ?? "Thread");
  const mode = packedGraphModes[packedValueAt(snapshot.nodes.mode, nodeIndex)];
  if (mode === undefined) {
    throw new RangeError(`director graph node ${nodeIndex} has an unknown mode`);
  }
  const status = tooltipStatuses[mode];
  assignTitle(label, title);
  assignStatus(label, status);
  assignMode(label, mode);
  return `${title}. ${status}. ${label.text}`;
}

function showPooledLabel(label: PooledLabel): void {
  if (!label.hidden) {
    return;
  }
  // Clearing the inline display hands it back to the stylesheet, where both
  // variants declare their own. The step label's two-line clamp needs
  // `display: -webkit-box`, which an inline `block` would override.
  label.element.style.display = "";
  label.hidden = false;
}

export class GraphLabelLayer {
  private readonly steps: PooledLabel[] = [];
  private readonly pills: PooledLabel[] = [];
  private readonly tooltips: PooledLabel[] = [];
  /*
   * Stable per thread rather than pooled by visible-array index. When the first
   * visible tile leaves, every later placement shifts left in that array; an
   * index pool therefore replaced one title's text with another in place. A
   * stable key lets each title fade independently and remain attached to its
   * thread throughout an interruptible scroll.
   */
  private readonly titles = new Map<string, HTMLElement>();
  private readonly titlePlacements = new Map<string, GraphColumnTitlePlacement>();
  private readonly visibleTitleKeys = new Set<string>();
  private readonly pendingTitleKeys = new Set<string>();
  private titleRevealFrame: number | null = null;
  private readonly announcer: HTMLElement;
  private readonly columnTitleTooltip: HTMLElement;
  private readonly columnTitleTooltipId: string;
  private readonly tooltipIdPrefix: string;
  private focusedTitleKey: string | null = null;
  private hoveredTitleKey: string | null = null;
  private visibleTitleTooltipKey: string | null = null;
  /** Whether a pill discloses a fold here, or navigates. See assignExpanded. */
  private foldable = true;
  private stepsUsed = 0;
  private pillsUsed = 0;
  private tooltipsUsed = 0;
  private announcement = "";

  constructor(
    private readonly root: HTMLElement,
    private readonly ownerDocument: Document,
    private readonly callbacks: GraphLabelLayerCallbacks,
  ) {
    graphLabelLayerSequence += 1;
    this.tooltipIdPrefix = `director-graph-tooltip-${graphLabelLayerSequence}`;
    this.columnTitleTooltipId = `director-column-title-tooltip-${graphLabelLayerSequence}`;
    this.announcer = ownerDocument.createElement("div");
    this.announcer.className = "director-graph-announcer";
    this.announcer.setAttribute("role", "status");
    this.columnTitleTooltip = ownerDocument.createElement("div");
    this.columnTitleTooltip.className = "director-column-title-tooltip";
    this.columnTitleTooltip.id = this.columnTitleTooltipId;
    this.columnTitleTooltip.setAttribute("aria-hidden", "true");
    this.columnTitleTooltip.setAttribute("data-visible", "false");
    this.columnTitleTooltip.setAttribute("role", "tooltip");
    this.root.append(this.announcer, this.columnTitleTooltip);
  }

  /**
   * Draws the thread names the canvas computed. Each thread owns one stable
   * element, so visibility can transition without swapping text between slots.
   */
  applyColumnTitles(placements: readonly GraphColumnTitlePlacement[]): void {
    this.titlePlacements.clear();
    this.visibleTitleKeys.clear();
    let titleInteractionChanged = false;
    for (const placement of placements) {
      this.titlePlacements.set(placement.key, placement);
      this.visibleTitleKeys.add(placement.key);
      const acquired = this.acquireColumnTitle(placement);
      titleInteractionChanged ||= acquired.interactionChanged;
      this.syncColumnTitleElement(acquired.element, placement);
    }
    this.hideTitlesOutsideFrame();
    titleInteractionChanged ||= this.clearInvisibleActiveTitle();
    this.syncColumnTitleTooltip();
    if (titleInteractionChanged) {
      this.syncColumnTitleHover();
    }
    this.scheduleTitleReveal();
  }

  private acquireColumnTitle(placement: GraphColumnTitlePlacement): {
    readonly element: HTMLElement;
    readonly interactionChanged: boolean;
  } {
    let element = this.titles.get(placement.key);
    let interactionChanged = false;
    const expectedTagName = placement.openable ? "BUTTON" : "SPAN";
    if (element !== undefined && element.tagName !== expectedTagName) {
      interactionChanged = this.removeColumnTitle(placement.key, element);
      element = undefined;
    }
    element ??= this.createColumnTitle(placement);
    return { element, interactionChanged };
  }

  private removeColumnTitle(titleKey: string, element: HTMLElement): boolean {
    if (this.visibleTitleTooltipKey === titleKey) {
      this.hideColumnTitleTooltip();
    }
    let interactionChanged = false;
    if (this.focusedTitleKey === titleKey) {
      this.focusedTitleKey = null;
      interactionChanged = true;
    }
    if (this.hoveredTitleKey === titleKey) {
      this.hoveredTitleKey = null;
      interactionChanged = true;
    }
    this.titles.delete(titleKey);
    this.pendingTitleKeys.delete(titleKey);
    element.remove();
    return interactionChanged;
  }

  private createColumnTitle(placement: GraphColumnTitlePlacement): HTMLElement {
    const titleKey = placement.key;
    const element = this.ownerDocument.createElement(placement.openable ? "button" : "span");
    element.className = "director-column-title";
    if (placement.openable) {
      element.setAttribute("type", "button");
      element.addEventListener("click", () => {
        if (this.titlePlacements.get(titleKey)?.openable === true) {
          this.callbacks.onColumnTitleActivated(titleKey);
        }
      });
    }
    element.setAttribute("data-visible", "false");
    element.style.left = "0px";
    element.style.top = "0px";
    this.connectColumnTitleInteractions(element, titleKey);
    this.root.append(element);
    this.titles.set(titleKey, element);
    this.pendingTitleKeys.add(titleKey);
    return element;
  }

  private connectColumnTitleInteractions(element: HTMLElement, titleKey: string): void {
    element.addEventListener("pointerenter", () => {
      this.hoveredTitleKey = titleKey;
      this.syncColumnTitleTooltip();
      this.syncColumnTitleHover();
    });
    element.addEventListener("pointerleave", () => {
      if (this.hoveredTitleKey === titleKey) {
        this.hoveredTitleKey = null;
      }
      this.syncColumnTitleTooltip();
      this.syncColumnTitleHover();
    });
    element.addEventListener("focus", () => {
      this.focusedTitleKey = titleKey;
      this.syncColumnTitleTooltip();
      this.syncColumnTitleHover();
    });
    element.addEventListener("blur", () => {
      if (this.focusedTitleKey === titleKey) {
        this.focusedTitleKey = null;
      }
      this.syncColumnTitleTooltip();
      this.syncColumnTitleHover();
    });
    element.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.clearColumnTitleInteraction(titleKey);
      this.hideColumnTitleTooltip();
      this.syncColumnTitleHover();
    });
    element.addEventListener("transitionend", (event) => {
      if (
        event.propertyName === "opacity" &&
        element.getAttribute("data-visible") === "false" &&
        this.titles.get(titleKey) === element
      ) {
        this.titles.delete(titleKey);
        element.remove();
      }
    });
  }

  private clearColumnTitleInteraction(titleKey: string): void {
    if (this.focusedTitleKey === titleKey) {
      this.focusedTitleKey = null;
    }
    if (this.hoveredTitleKey === titleKey) {
      this.hoveredTitleKey = null;
    }
  }

  private syncColumnTitleElement(element: HTMLElement, placement: GraphColumnTitlePlacement): void {
    assignElementText(element, placement.text);
    syncColumnTitleTabStop(element, placement);
    assignElementAttribute(element, "data-pinned", String(placement.pinned));
    assignElementAttribute(element, "data-openable", String(placement.openable));
    // Keep the DOM on the same fractional screen coordinate as WebGL.
    assignElementStyle(element, "left", "0px");
    assignElementStyle(element, "top", "0px");
    assignElementStyle(
      element,
      "translate",
      `${placement.x.toFixed(3)}px ${placement.y.toFixed(3)}px`,
    );
    assignElementAttribute(element, "data-self", String(placement.self));
    if (!this.pendingTitleKeys.has(placement.key)) {
      assignElementAttribute(element, "data-visible", "true");
    }
  }

  private hideTitlesOutsideFrame(): void {
    for (const [key, element] of this.titles) {
      if (this.visibleTitleKeys.has(key)) {
        continue;
      }
      if (this.pendingTitleKeys.delete(key)) {
        this.titles.delete(key);
        element.remove();
      } else {
        assignElementAttribute(element, "data-visible", "false");
      }
    }
  }

  private clearInvisibleActiveTitle(): boolean {
    const activeTitleKey = this.focusedTitleKey ?? this.hoveredTitleKey;
    if (activeTitleKey === null || this.visibleTitleKeys.has(activeTitleKey)) {
      return false;
    }
    this.clearColumnTitleInteraction(activeTitleKey);
    return true;
  }

  /** Applies one frame's placements. Nothing else in the loop touches the DOM. */
  apply({
    activityNodesOnly = false,
    count,
    foldable,
    hoveredNode = null,
    placements,
    snapshot,
    titles = emptyColumnTitles,
  }: GraphLabelFrame): void {
    this.foldable = foldable;
    // Side-by-side columns get the mockup's tighter label budget (multi-cols):
    // full-width pills from neighbouring columns collide across the gap.
    const columns = foldable ? "single" : "many";
    if (this.root.getAttribute("data-columns") !== columns) {
      this.root.setAttribute("data-columns", columns);
    }
    const usage: FrameLabelUsage = {
      activeAnnouncement: "",
      activeTooltip: null,
      pills: 0,
      steps: 0,
      tooltips: 0,
    };
    for (let index = 0; index < count; index += 1) {
      const placement = placements[index];
      if (placement === undefined) {
        break;
      }
      const kind = frameLabelKind(snapshot, placement, foldable, activityNodesOnly, hoveredNode);
      this.applyFramePlacement(kind, usage, snapshot, placement, titles);
    }
    this.hideFrom(this.steps, usage.steps, this.stepsUsed);
    this.hideFrom(this.pills, usage.pills, this.pillsUsed);
    this.hideFrom(this.tooltips, usage.tooltips, this.tooltipsUsed);
    this.stepsUsed = usage.steps;
    this.pillsUsed = usage.pills;
    this.tooltipsUsed = usage.tooltips;
    this.syncActiveTooltip(usage.activeTooltip, usage.activeAnnouncement);
  }

  private applyFramePlacement(
    kind: FrameLabelKind,
    usage: FrameLabelUsage,
    snapshot: PackedGraphSnapshot,
    placement: GraphLabelPlacement,
    titles: ReadonlyMap<string, string>,
  ): void {
    switch (kind) {
      case "tooltip": {
        const label = this.tooltip(usage.tooltips);
        usage.activeAnnouncement = this.write({
          isPill: false,
          isTooltip: true,
          label,
          placement,
          snapshot,
          titles,
        });
        usage.activeTooltip = label;
        usage.tooltips += 1;
        return;
      }
      case "pill":
        this.write({
          isPill: true,
          isTooltip: false,
          label: this.pill(usage.pills),
          placement,
          snapshot,
          titles,
        });
        usage.pills += 1;
        return;
      case "step":
        this.write({
          isPill: false,
          isTooltip: false,
          label: this.step(usage.steps),
          placement,
          snapshot,
          titles,
        });
        usage.steps += 1;
    }
  }

  dispose(): void {
    if (this.titleRevealFrame !== null) {
      this.ownerDocument.defaultView?.cancelAnimationFrame?.(this.titleRevealFrame);
      this.titleRevealFrame = null;
    }
    this.callbacks.interactionRoot.removeAttribute("aria-describedby");
    this.root.replaceChildren();
    this.steps.length = 0;
    this.pills.length = 0;
    this.tooltips.length = 0;
    this.titles.clear();
    this.titlePlacements.clear();
    this.visibleTitleKeys.clear();
    this.pendingTitleKeys.clear();
    this.focusedTitleKey = null;
    this.hoveredTitleKey = null;
    this.visibleTitleTooltipKey = null;
    this.callbacks.onColumnTitleHovered(null);
    this.stepsUsed = 0;
    this.pillsUsed = 0;
    this.tooltipsUsed = 0;
  }

  /**
   * New elements need one painted frame in their resting hidden state before
   * the visible state is applied. One shared callback handles an entire batch;
   * there is no per-title layout read or timer.
   */
  private scheduleTitleReveal(): void {
    if (this.pendingTitleKeys.size === 0 || this.titleRevealFrame !== null) {
      return;
    }
    const view = this.ownerDocument.defaultView;
    if (view === null || typeof view.requestAnimationFrame !== "function") {
      for (const key of this.pendingTitleKeys) {
        this.titles.get(key)?.setAttribute("data-visible", "true");
      }
      this.pendingTitleKeys.clear();
      return;
    }
    this.titleRevealFrame = view.requestAnimationFrame(() => {
      this.titleRevealFrame = null;
      for (const key of this.pendingTitleKeys) {
        if (this.visibleTitleKeys.has(key)) {
          this.titles.get(key)?.setAttribute("data-visible", "true");
        }
      }
      this.pendingTitleKeys.clear();
    });
  }

  /**
   * The graph overlay is intentionally imperative so scrolling never renders
   * React. This shared tooltip follows the same ARIA contract as the app's
   * Base UI tooltip while adding no per-title component or frame-time read.
   */
  private syncColumnTitleTooltip(): void {
    const active = this.activeColumnTitle();
    if (active === null) {
      this.hideColumnTitleTooltip();
      return;
    }
    this.showColumnTitleTooltip(active);
  }

  private activeColumnTitle(): ActiveColumnTitle | null {
    const key = this.focusedTitleKey ?? this.hoveredTitleKey;
    if (key === null) {
      return null;
    }
    const placement = this.titlePlacements.get(key);
    if (placement === undefined || (!placement.pinned && !placement.openable)) {
      return null;
    }
    const element = this.titles.get(key);
    return element === undefined ? null : { element, key, placement };
  }

  private showColumnTitleTooltip({ element, key, placement }: ActiveColumnTitle): void {
    if (this.visibleTitleTooltipKey !== key) {
      this.activateColumnTitleTooltip(element, key, placement.text);
    } else {
      assignElementText(this.columnTitleTooltip, placement.text);
    }
    const translate = `${placement.tooltipX.toFixed(3)}px ${(placement.y + 24).toFixed(3)}px`;
    assignElementStyle(this.columnTitleTooltip, "translate", translate);
    // Titles are appended lazily as workstreams enter the viewport. Keep the
    // one shared tooltip last in the overlay's paint order so a later title or
    // node tooltip can never cover the disclosure for the title being read.
    if (this.root.lastElementChild !== this.columnTitleTooltip) {
      this.root.append(this.columnTitleTooltip);
    }
  }

  private activateColumnTitleTooltip(element: HTMLElement, key: string, text: string): void {
    const previous = this.visibleTitleTooltipKey;
    if (previous !== null) {
      this.titles.get(previous)?.removeAttribute("aria-describedby");
      this.titles.get(previous)?.removeAttribute("data-tooltip-open");
    }
    element.setAttribute("aria-describedby", this.columnTitleTooltipId);
    element.setAttribute("data-tooltip-open", "true");
    assignElementText(this.columnTitleTooltip, text);
    this.columnTitleTooltip.removeAttribute("aria-hidden");
    this.columnTitleTooltip.setAttribute("data-visible", "true");
    this.visibleTitleTooltipKey = key;
  }

  private syncColumnTitleHover(): void {
    const key = this.focusedTitleKey ?? this.hoveredTitleKey;
    const placement = key === null ? undefined : this.titlePlacements.get(key);
    this.callbacks.onColumnTitleHovered(placement?.openable === true ? placement.key : null);
  }

  private hideColumnTitleTooltip(): void {
    if (this.visibleTitleTooltipKey === null) {
      return;
    }
    const title = this.titles.get(this.visibleTitleTooltipKey);
    title?.removeAttribute("aria-describedby");
    title?.removeAttribute("data-tooltip-open");
    this.columnTitleTooltip.setAttribute("aria-hidden", "true");
    this.columnTitleTooltip.setAttribute("data-visible", "false");
    this.visibleTitleTooltipKey = null;
  }

  private write({
    isPill,
    isTooltip,
    label,
    placement,
    snapshot,
    titles,
  }: LabelWriteInput): string {
    label.nodeIndex = placement.nodeIndex;
    const variant = variantOf(snapshot, placement.nodeIndex);
    assignText(label, snapshot.nodes.labels[placement.nodeIndex] ?? "");
    const announcement = isTooltip
      ? writeNodeTooltip(label, snapshot, placement.nodeIndex, titles)
      : "";
    if (isPill) {
      assignMark(label, pillMarks[variant]);
      assignExpanded(label, this.foldable ? placement.expanded : null);
    }
    assignClassName(
      label,
      isTooltip ? "director-graph-tooltip" : className(isPill, variant, placement.sticky),
    );
    assignOpacity(label, placement.opacity.toFixed(3));
    assignStyle(
      label,
      `${placement.x.toFixed(3)}px ${placement.y.toFixed(3)}px`,
      placement.anchor === "over" ? "translate(-50%,-50%)" : "translateX(-50%)",
    );
    showPooledLabel(label);
    return announcement;
  }

  private step(index: number): PooledLabel {
    const existing = this.steps[index];
    if (existing !== undefined) {
      return existing;
    }
    const element = this.ownerDocument.createElement("div");
    const label = newPooled(element, null, null, null, null);
    this.steps.push(label);
    this.root.append(element);
    return label;
  }

  private tooltip(index: number): PooledLabel {
    const existing = this.tooltips[index];
    if (existing !== undefined) {
      return existing;
    }
    const element = this.ownerDocument.createElement("div");
    element.id = `${this.tooltipIdPrefix}-${index}`;
    element.setAttribute("role", "tooltip");
    const title = this.ownerDocument.createElement("span");
    title.className = "director-graph-tooltip-title";
    const status = this.ownerDocument.createElement("span");
    status.className = "director-graph-tooltip-status";
    const summary = this.ownerDocument.createElement("span");
    summary.className = "director-graph-tooltip-summary";
    element.append(title, status, summary);
    const label = newPooled(element, summary, null, title, status);
    this.tooltips.push(label);
    this.root.append(element);
    return label;
  }

  /**
   * Question and outcome labels are buttons: the checklist requires a keyboard
   * equivalent for the outcome-node click, and a focusable control is the one
   * that already has it.
   */
  private pill(index: number): PooledLabel {
    const existing = this.pills[index];
    if (existing !== undefined) {
      return existing;
    }
    const element = this.ownerDocument.createElement("button");
    element.type = "button";
    const mark = this.ownerDocument.createElement("span");
    mark.className = "director-graph-pill-mark";
    mark.setAttribute("aria-hidden", "true");
    const summary = this.ownerDocument.createElement("span");
    summary.className = "director-graph-pill-summary";
    element.append(mark, summary);
    const label = newPooled(element, summary, mark, null, null);
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      this.callbacks.onPillActivated(label.nodeIndex);
    });
    this.pills.push(label);
    this.root.append(element);
    return label;
  }

  private syncActiveTooltip(tooltip: PooledLabel | null, announcement: string): void {
    if (tooltip === null) {
      this.callbacks.interactionRoot.removeAttribute("aria-describedby");
    } else if (
      this.callbacks.interactionRoot.getAttribute("aria-describedby") !== tooltip.element.id
    ) {
      this.callbacks.interactionRoot.setAttribute("aria-describedby", tooltip.element.id);
    }
    const active = this.ownerDocument.activeElement;
    const shouldAnnounce =
      tooltip !== null &&
      (active === this.callbacks.interactionRoot ||
        (active !== null && this.callbacks.interactionRoot.contains(active)));
    const nextAnnouncement = shouldAnnounce ? announcement : "";
    if (this.announcement === nextAnnouncement) {
      return;
    }
    this.announcer.textContent = nextAnnouncement;
    this.announcement = nextAnnouncement;
  }

  private hideFrom(pool: readonly PooledLabel[], from: number, previousUsed: number): void {
    for (let index = from; index < previousUsed; index += 1) {
      const label = pool[index];
      if (label === undefined || label.hidden) {
        continue;
      }
      label.element.style.display = "none";
      label.hidden = true;
    }
  }
}

function newPooled(
  element: HTMLElement,
  summary: HTMLElement | null,
  mark: HTMLElement | null,
  title: HTMLElement | null,
  status: HTMLElement | null,
): PooledLabel {
  element.style.display = "none";
  element.style.left = "0px";
  element.style.top = "0px";
  return {
    element,
    summary,
    mark,
    title,
    status,
    text: "",
    markText: "",
    titleText: "",
    statusText: "",
    mode: "",
    transform: "",
    translate: "",
    opacity: "",
    className: "",
    expanded: null,
    hidden: true,
    nodeIndex: -1,
  };
}

/** A question pill carries the prompt mark; an outcome pill carries its result. */
function variantOf(snapshot: PackedGraphSnapshot, nodeIndex: number): PillVariant {
  const role = packedValueAt(snapshot.nodes.role, nodeIndex);
  return role === packedGraphRoleCode.outcome ? outcomeVariant(snapshot, nodeIndex) : "question";
}

function outcomeVariant(snapshot: PackedGraphSnapshot, nodeIndex: number): PillVariant {
  const turn = packedValueAt(snapshot.nodes.turn, nodeIndex);
  const outcome = packedGraphOutcomes[packedValueAt(snapshot.turns.outcome, turn)];
  if (outcome === undefined) {
    throw new RangeError(`director graph turn ${turn} has an unknown outcome code`);
  }
  return outcome;
}
