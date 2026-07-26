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
  packedGraphOutcomes,
  packedGraphRoleCode,
  packedValueAt,
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
  text: string;
  markText: string;
  transform: string;
  left: string;
  top: string;
  opacity: string;
  className: string;
  expanded: boolean | null;
  hidden: boolean;
  nodeIndex: number;
}

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

function assignStyle(label: PooledLabel, left: string, top: string, transform: string): void {
  if (label.left !== left) {
    label.element.style.left = left;
    label.left = left;
  }
  if (label.top !== top) {
    label.element.style.top = top;
    label.top = top;
  }
  if (label.transform !== transform) {
    label.element.style.transform = transform;
    label.transform = transform;
  }
}

export interface GraphLabelLayerCallbacks {
  /** The user activated a question or outcome pill: fold or unfold its turn. */
  onPillActivated(nodeIndex: number): void;
}

export class GraphLabelLayer {
  private readonly steps: PooledLabel[] = [];
  private readonly pills: PooledLabel[] = [];
  /** Whether a pill discloses a fold here, or navigates. See assignExpanded. */
  private foldable = true;
  private stepsUsed = 0;
  private pillsUsed = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly ownerDocument: Document,
    private readonly callbacks: GraphLabelLayerCallbacks,
  ) {}

  /** Applies one frame's placements. Nothing else in the loop touches the DOM. */
  apply(
    snapshot: PackedGraphSnapshot,
    placements: readonly GraphLabelPlacement[],
    count: number,
    foldable: boolean,
  ): void {
    this.foldable = foldable;
    let steps = 0;
    let pills = 0;
    for (let index = 0; index < count; index += 1) {
      const placement = placements[index];
      if (placement === undefined) {
        break;
      }
      const role = packedValueAt(snapshot.nodes.role, placement.nodeIndex);
      const isPill = role === packedGraphRoleCode.outcome || role === packedGraphRoleCode.input;
      const label = isPill ? this.pill(pills) : this.step(steps);
      this.write(label, snapshot, placement, isPill);
      if (isPill) {
        pills += 1;
        continue;
      }
      steps += 1;
    }
    this.hideFrom(this.steps, steps, this.stepsUsed);
    this.hideFrom(this.pills, pills, this.pillsUsed);
    this.stepsUsed = steps;
    this.pillsUsed = pills;
  }

  dispose(): void {
    this.root.replaceChildren();
    this.steps.length = 0;
    this.pills.length = 0;
    this.stepsUsed = 0;
    this.pillsUsed = 0;
  }

  private write(
    label: PooledLabel,
    snapshot: PackedGraphSnapshot,
    placement: GraphLabelPlacement,
    isPill: boolean,
  ): void {
    label.nodeIndex = placement.nodeIndex;
    const variant = variantOf(snapshot, placement.nodeIndex);
    assignText(label, snapshot.nodes.labels[placement.nodeIndex] ?? "");
    if (isPill) {
      assignMark(label, pillMarks[variant]);
      assignExpanded(label, this.foldable ? placement.expanded : null);
    }
    assignClassName(label, className(isPill, variant, placement.sticky));
    assignOpacity(label, placement.opacity.toFixed(3));
    assignStyle(
      label,
      `${Math.round(placement.x)}px`,
      `${Math.round(placement.y)}px`,
      placement.anchor === "over" ? "translate(-50%,-50%)" : "translateX(-50%)",
    );
    if (label.hidden) {
      // Clearing the inline display hands it back to the stylesheet, where both
      // variants declare their own. The step label's two-line clamp needs
      // `display: -webkit-box`, which an inline `block` would override.
      label.element.style.display = "";
      label.hidden = false;
    }
  }

  private step(index: number): PooledLabel {
    const existing = this.steps[index];
    if (existing !== undefined) {
      return existing;
    }
    const element = this.ownerDocument.createElement("div");
    const label = newPooled(element, null, null);
    this.steps.push(label);
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
    const label = newPooled(element, summary, mark);
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      this.callbacks.onPillActivated(label.nodeIndex);
    });
    this.pills.push(label);
    this.root.append(element);
    return label;
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
): PooledLabel {
  element.style.display = "none";
  return {
    element,
    summary,
    mark,
    text: "",
    markText: "",
    transform: "",
    left: "",
    top: "",
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
