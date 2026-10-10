import type { WorkspaceSection } from "@setta/workspace";
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ReviewContext,
  type ReviewActions,
  type ReviewContextValue,
  type ReviewSubjectSelection,
} from "../app/reviewContext";
import {
  changesRequestedResponse,
  completionResponse,
  selectedChoiceResponse,
} from "../app/reviewModel";
import {
  REVIEW_ARTIFACT_CHOICE_SECTION_KIND,
  REVIEW_ARTIFACT_SECTION_KIND,
  REVIEW_CHOICE_SECTION_KIND,
  REVIEW_CLAIMS_SECTION_KIND,
  REVIEW_EVIDENCE_SECTION_KIND,
} from "../app/reviewProjection";
import type {
  ArtifactAnnotation as ArtifactAnnotationContract,
  RequestSnapshot,
  ReviewSnapshot,
} from "../api/generatedContract";
import { ArtifactChoiceSection } from "./ArtifactChoiceSection";
import { ArtifactSection } from "./ArtifactSection";
import { ChoiceMatrixSection } from "./ChoiceMatrixSection";
import { ClaimsSection } from "./ClaimsSection";
import { EvidenceSection } from "./EvidenceSection";
import {
  loadAnnotationDrafts,
  persistAnnotationDraft,
} from "../app/reviewDrafts";

const SHA = "a".repeat(64);
const CREATED_AT = "2026-09-19T12:00:00Z";

function workspaceSection(
  id: string,
  kind: string,
  name: string,
  data: Record<string, string>,
): WorkspaceSection {
  return {
    children: [],
    data,
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind,
    name,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: "auto", width: 600 },
    styleColor: null,
    tagColor: null,
  };
}

function snapshotFor(...requests: RequestSnapshot[]): ReviewSnapshot {
  return {
    project: {
      id: "review-project",
      name: "Review project",
      requests: requests.map((request) => request.path),
      version: 1,
    },
    requests,
    revision: 3,
    version: 1,
  };
}

function createActions(overrides: Partial<ReviewActions> = {}): ReviewActions {
  return {
    addAnnotationStroke: vi.fn(),
    clearAnnotations: vi.fn(),
    confirmChoice: vi.fn(async () => {}),
    decideClaim: vi.fn(async () => {}),
    requestChanges: vi.fn(async () => {}),
    selectEvidence: vi.fn(),
    selectOption: vi.fn(),
    selectSubject: vi.fn(),
    setDrawing: vi.fn(),
    ...overrides,
  };
}

function contextValue(
  snapshot: ReviewSnapshot,
  actions: ReviewActions,
  overrides: Partial<Omit<ReviewContextValue, "actions" | "snapshot">> = {},
): ReviewContextValue {
  return {
    actions,
    annotationsByRequest: {},
    busyRequestId: null,
    drawing: null,
    error: null,
    selectedEvidenceId: null,
    selectedOptions: {},
    selection: null,
    snapshot,
    ...overrides,
  };
}

function completionRequest(): RequestSnapshot {
  return {
    assessments: [
      {
        assessment: "supported",
        caveat: null,
        claimId: "tokens",
        createdAt: CREATED_AT,
        id: "assessment-tokens",
        producer: { harness: "Codex CLI", model: "gpt-6" },
        rationale: "The focused tests pass.",
        requestId: "completion-request",
        version: 1,
      },
      {
        assessment: "contradicted",
        caveat: null,
        claimId: "migration",
        createdAt: CREATED_AT,
        id: "assessment-migration",
        producer: { harness: "Claude Code", model: "opus" },
        rationale: "A legacy row was dropped.",
        requestId: "completion-request",
        version: 1,
      },
    ],
    evidence: [],
    path: "requests/completion.json",
    request: {
      completion: {
        claims: [
          { id: "tokens", text: "Invalid tokens are rejected" },
          { id: "migration", text: "Migration preserves every row" },
          { id: "rollback", text: "Rollback restores the previous schema" },
        ],
      },
      evidence: [],
      id: "completion-request",
      provenance: {
        createdAt: CREATED_AT,
        producer: {
          kind: "agent",
          name: "Builder",
          model: "gpt-6",
          harness: "Codex CLI",
        },
      },
      relations: [],
      requestedDecision: "Verify the migration before release.",
      title: "Can schema v3 ship?",
      type: "completion",
      version: 1,
    },
    response: null,
    sha256: SHA,
  };
}

function matrixRequest(): RequestSnapshot {
  return {
    assessments: [],
    evidence: [
      {
        content: {
          endLine: 14,
          kind: "text",
          startLine: 10,
          text: "attempt one\nattempt two\nzero failures\nall checks passed\ndone",
          truncated: false,
        },
        error: null,
        evidenceId: "reliability-log",
        status: "resolved",
      },
    ],
    path: "requests/rollout.json",
    request: {
      choice: {
        expectedResponse: "selection",
        factors: [
          {
            description: "Observed failures during rehearsal",
            id: "reliability",
            label: "Reliability",
          },
          {
            description: "Time required to complete rollout",
            id: "duration",
            label: "Duration",
          },
        ],
        options: [
          {
            artifactEvidenceId: null,
            description: "Move all consumers immediately",
            id: "immediate",
            label: "Immediate cutover",
          },
          {
            artifactEvidenceId: null,
            description: "Run old and new readers together",
            id: "gradual",
            label: "Seven-day rollout",
          },
        ],
        presentation: "matrix",
        recommendation: {
          optionId: "gradual",
          rationale: "It limits rollback risk.",
        },
        tradeoffs: [
          {
            factorId: "reliability",
            optionId: "immediate",
            tone: "risk",
            value: "Two incompatible consumers",
          },
          {
            factorId: "duration",
            optionId: "immediate",
            tone: "support",
            value: "One hour",
          },
          {
            factorId: "reliability",
            optionId: "gradual",
            tone: "support",
            value: "Zero rehearsal failures",
          },
          {
            factorId: "duration",
            optionId: "gradual",
            tone: "tradeoff",
            value: "Seven days",
          },
        ],
      },
      evidence: [
        {
          id: "reliability-log",
          kind: "text",
          text: {
            endLine: 14,
            mediaType: "text/plain",
            path: "results/reliability.log",
            sourceSha256: SHA,
            startLine: 10,
          },
        },
      ],
      id: "rollout-request",
      provenance: {
        createdAt: CREATED_AT,
        producer: { kind: "script", name: "rollout-study" },
      },
      relations: [
        {
          citations: [{ endLine: 13, kind: "lineRange", startLine: 12 }],
          evidenceId: "reliability-log",
          id: "reliability-evidence",
          role: "supports",
          subjectId: "reliability",
          subjectKind: "factor",
        },
      ],
      requestedDecision: "Choose the rollout strategy.",
      title: "How should schema v3 ship?",
      type: "choice",
      version: 1,
    },
    response: null,
    sha256: SHA,
  };
}

function artifactRequest(mediaType = "image/png"): RequestSnapshot {
  return {
    assessments: [],
    evidence: [
      {
        content: {
          byteLength: 4_096,
          kind: "artifact",
          mediaType,
          route: "/api/evidence/artifact-request/candidate-a",
          sha256: SHA,
        },
        error: null,
        evidenceId: "candidate-a",
        status: "resolved",
      },
    ],
    path: "requests/artifact.json",
    request: {
      choice: {
        expectedResponse: "selection",
        factors: [],
        options: [
          {
            artifactEvidenceId: "candidate-a",
            description: "Higher contrast navigation",
            id: "option-a",
            label: "Candidate A",
          },
        ],
        presentation: "artifacts",
        recommendation: null,
        tradeoffs: [],
      },
      evidence: [
        {
          artifact: {
            byteLength: 4_096,
            mediaType,
            path: "artifacts/candidate-a.png",
            sha256: SHA,
          },
          id: "candidate-a",
          kind: "artifact",
        },
      ],
      id: "artifact-request",
      provenance: {
        createdAt: CREATED_AT,
        producer: {
          kind: "agent",
          name: "Designer",
          model: "gpt-6",
          harness: "Codex CLI",
        },
      },
      relations: [],
      requestedDecision: "Choose a visual treatment or request changes.",
      title: "Which navigation treatment should ship?",
      type: "choice",
      version: 1,
    },
    response: null,
    sha256: SHA,
  };
}

const COMPLETION_REQUEST = completionRequest();
const COMPLETION_SNAPSHOT = snapshotFor(COMPLETION_REQUEST);
const MATRIX_REQUEST = matrixRequest();
const MATRIX_SNAPSHOT = snapshotFor(MATRIX_REQUEST);
const ARTIFACT_REQUEST = artifactRequest();
const ARTIFACT_SNAPSHOT = snapshotFor(ARTIFACT_REQUEST);

const COMPLETION_SECTION = workspaceSection(
  "completion-section",
  REVIEW_CLAIMS_SECTION_KIND,
  COMPLETION_REQUEST.request.title,
  { requestId: COMPLETION_REQUEST.request.id },
);
const MATRIX_SECTION = workspaceSection(
  "matrix-section",
  REVIEW_CHOICE_SECTION_KIND,
  MATRIX_REQUEST.request.title,
  { requestId: MATRIX_REQUEST.request.id },
);
const MATRIX_EVIDENCE_SECTION = workspaceSection(
  "matrix-evidence",
  REVIEW_EVIDENCE_SECTION_KIND,
  "reliability.log",
  { evidenceId: "reliability-log", requestId: MATRIX_REQUEST.request.id },
);
const ARTIFACT_CHOICE_SECTION = workspaceSection(
  "artifact-choice-section",
  REVIEW_ARTIFACT_CHOICE_SECTION_KIND,
  ARTIFACT_REQUEST.request.title,
  { requestId: ARTIFACT_REQUEST.request.id },
);
const ARTIFACT_SECTION = workspaceSection(
  "artifact-section",
  REVIEW_ARTIFACT_SECTION_KIND,
  "Candidate A",
  { evidenceId: "candidate-a", requestId: ARTIFACT_REQUEST.request.id },
);

function MatrixWorkflow({
  confirmChoice,
}: {
  confirmChoice: ReviewActions["confirmChoice"];
}) {
  const [selection, setSelection] = useState<ReviewSubjectSelection | null>(
    null,
  );
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string | null>
  >({ "rollout-request": null });
  const actions = createActions({
    confirmChoice,
    selectOption: (requestId, optionId) => {
      setSelectedOptions((current) => ({
        ...current,
        [requestId]: optionId,
      }));
    },
    selectSubject: setSelection,
  });
  return (
    <ReviewContext.Provider
      value={contextValue(MATRIX_SNAPSHOT, actions, {
        selectedOptions,
        selection,
      })}
    >
      <ChoiceMatrixSection section={MATRIX_SECTION} />
      <EvidenceSection section={MATRIX_EVIDENCE_SECTION} />
    </ReviewContext.Provider>
  );
}

function ArtifactWorkflow({
  onRevisionAttempt,
  onStroke,
}: {
  onRevisionAttempt: (
    requestId: string,
    rationale: string,
    annotationCount: number,
  ) => void;
  onStroke: ReviewActions["addAnnotationStroke"];
}) {
  const [annotations, setAnnotations] = useState<ArtifactAnnotationContract[]>(
    [],
  );
  const [drawing, setDrawing] = useState<ReviewContextValue["drawing"]>(null);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string | null>
  >({ "artifact-request": null });
  const actions = createActions({
    addAnnotationStroke: (requestId, evidenceId, points) => {
      onStroke(requestId, evidenceId, points);
      setAnnotations([
        {
          artifactEvidenceId: evidenceId,
          artifactSha256: SHA,
          id: `annotation:${requestId}:${evidenceId}`,
          paths: [
            {
              color: "#5ee693",
              points: points.map((point) => ({ ...point })),
              width: 0.008,
            },
          ],
        },
      ]);
    },
    clearAnnotations: () => setAnnotations([]),
    requestChanges: async (requestId, rationale) => {
      onRevisionAttempt(requestId, rationale, annotations.length);
      changesRequestedResponse(ARTIFACT_REQUEST, rationale, annotations);
    },
    selectOption: (requestId, optionId) =>
      setSelectedOptions((current) => ({
        ...current,
        [requestId]: optionId,
      })),
    setDrawing: (requestId, evidenceId) =>
      setDrawing(evidenceId ? { evidenceId, requestId } : null),
  });
  return (
    <ReviewContext.Provider
      value={contextValue(ARTIFACT_SNAPSHOT, actions, {
        annotationsByRequest: { "artifact-request": annotations },
        drawing,
        selectedOptions,
      })}
    >
      <ArtifactChoiceSection section={ARTIFACT_CHOICE_SECTION} />
      <ArtifactSection section={ARTIFACT_SECTION} />
    </ReviewContext.Provider>
  );
}

function buttonContaining(
  container: Element,
  label: string,
): HTMLButtonElement {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).find((candidate) => candidate.textContent?.includes(label));
  if (!button) {
    throw new Error(`No button contains ${label}.`);
  }
  return button;
}

function setControlValue(
  control: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const prototype =
    control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (!descriptor?.set) {
    throw new Error("This environment has no native control value setter.");
  }
  act(() => {
    descriptor.set?.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click();
  });
}

function dispatchPointer(
  target: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  clientX: number,
  clientY: number,
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: 4 },
  });
  act(() => target.dispatchEvent(event));
}

function configureAnnotationSurface(surface: SVGSVGElement): void {
  const captured = new Set<number>();
  Object.assign(surface, {
    hasPointerCapture: (pointerId: number) => captured.has(pointerId),
    releasePointerCapture: (pointerId: number) => captured.delete(pointerId),
    setPointerCapture: (pointerId: number) => captured.add(pointerId),
  });
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
    bottom: 350,
    height: 200,
    left: 50,
    right: 450,
    toJSON: () => ({}),
    top: 150,
    width: 400,
    x: 50,
    y: 150,
  });
}

function artifactRect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top,
  };
}

function installControlledResizeObserver(): () => void {
  let callback: ResizeObserverCallback | null = null;
  class ControlledResizeObserver {
    public constructor(nextCallback: ResizeObserverCallback) {
      callback = nextCallback;
    }

    public disconnect(): void {}

    public observe(): void {}

    public unobserve(): void {}
  }
  vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
  return () => {
    if (!callback) {
      throw new Error("The artifact did not install its resize observer.");
    }
    act(() => callback?.([], {} as ResizeObserver));
  };
}

function loadArtifactImage(
  container: Element,
  layout: { height: number; width: number },
): HTMLImageElement {
  const stage = container.querySelector<HTMLDivElement>(
    ".review-artifact-stage",
  );
  const image = stage?.querySelector<HTMLImageElement>("img");
  if (!stage || !image) {
    throw new Error("The image artifact did not render.");
  }
  vi.spyOn(stage, "getBoundingClientRect").mockImplementation(() =>
    artifactRect(50, 100, layout.width, layout.height),
  );
  vi.spyOn(image, "getBoundingClientRect").mockImplementation(() =>
    artifactRect(50, 100, layout.width, layout.height),
  );
  Object.defineProperties(image, {
    offsetHeight: { configurable: true, get: () => layout.height },
    offsetLeft: { configurable: true, value: 0 },
    offsetParent: { configurable: true, value: stage },
    offsetTop: { configurable: true, value: 0 },
    offsetWidth: { configurable: true, get: () => layout.width },
    naturalHeight: { configurable: true, value: 800 },
    naturalWidth: { configurable: true, value: 1_600 },
  });
  act(() => image.dispatchEvent(new Event("load")));
  return image;
}

describe("Review section interactions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.sessionStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function render(node: ReactNode): void {
    act(() => root.render(node));
  }

  it("restores feedback after remount and removes the browser draft after submission", async () => {
    const actions = createActions();
    const form = (
      <ReviewContext.Provider value={contextValue(ARTIFACT_SNAPSHOT, actions)}>
        <ArtifactChoiceSection section={ARTIFACT_CHOICE_SECTION} />
      </ReviewContext.Provider>
    );
    render(form);
    await click(buttonContaining(container, "Request changes"));
    setControlValue(
      container.querySelector<HTMLTextAreaElement>("textarea")!,
      "Keep the heading readable.",
    );
    render(null);
    render(form);
    expect(container.querySelector("textarea")?.value).toBe(
      "Keep the heading readable.",
    );
    expect(container.textContent).toContain("Draft saved in this tab");
    await click(buttonContaining(container, "Send feedback"));
    expect(actions.requestChanges).toHaveBeenCalledWith(
      "artifact-request",
      "Keep the heading readable.",
    );
    render(null);
    render(form);
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("keeps feedback editable when browser storage is unavailable and protects it on close", async () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("Quota exceeded");
    });
    render(
      <ReviewContext.Provider
        value={contextValue(ARTIFACT_SNAPSHOT, createActions())}
      >
        <ArtifactChoiceSection section={ARTIFACT_CHOICE_SECTION} />
      </ReviewContext.Provider>,
    );
    await click(buttonContaining(container, "Request changes"));
    setControlValue(
      container.querySelector<HTMLTextAreaElement>("textarea")!,
      "Keep this feedback.",
    );
    expect(container.querySelector("textarea")?.value).toBe(
      "Keep this feedback.",
    );
    expect(container.textContent).toContain("Draft kept in memory");
    const closing = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(closing);
    expect(closing.defaultPrevented).toBe(true);
    expect(buttonContaining(container, "Send feedback").disabled).toBe(false);
  });

  it("restores drawing drafts only for the exact admitted artifact and preserves an explicit clear", () => {
    const annotations: ArtifactAnnotationContract[] = [
      {
        id: "draft",
        artifactEvidenceId: "candidate-a",
        artifactSha256: SHA,
        paths: [
          {
            color: "#5ee693",
            width: 0.008,
            points: [
              { x: 0.1, y: 0.2 },
              { x: 0.3, y: 0.4 },
            ],
          },
        ],
      },
    ];
    expect(
      persistAnnotationDraft(ARTIFACT_SNAPSHOT, ARTIFACT_REQUEST, annotations),
    ).toBeNull();
    expect(
      loadAnnotationDrafts(ARTIFACT_SNAPSHOT).drafts["artifact-request"],
    ).toEqual(annotations);
    const changed = structuredClone(ARTIFACT_SNAPSHOT);
    const evidence = changed.requests[0]!.evidence[0]!;
    if (evidence.status === "resolved" && evidence.content.kind === "artifact")
      evidence.content.sha256 = "b".repeat(64);
    expect(loadAnnotationDrafts(changed).drafts).toEqual({});
    expect(
      persistAnnotationDraft(ARTIFACT_SNAPSHOT, ARTIFACT_REQUEST, []),
    ).toBeNull();
    expect(
      loadAnnotationDrafts(ARTIFACT_SNAPSHOT).drafts["artifact-request"],
    ).toEqual([]);
  });

  it("keeps every completion claim visible and records a human decision", async () => {
    const decideClaim = vi.fn<ReviewActions["decideClaim"]>(async () => {});
    const actions = createActions({ decideClaim });
    render(
      <ReviewContext.Provider
        value={contextValue(COMPLETION_SNAPSHOT, actions, {
          selection: {
            requestId: "completion-request",
            subjectId: "rollback",
            subjectKind: "claim",
          },
        })}
      >
        <ClaimsSection section={COMPLETION_SECTION} />
      </ReviewContext.Provider>,
    );

    const visibleClaims = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"),
    ).map((row) => row.querySelector("strong")?.textContent);
    expect(visibleClaims).toEqual([
      "Invalid tokens are rejected",
      "Migration preserves every row",
      "Rollback restores the previous schema",
    ]);
    expect(
      buttonContaining(container, "Rollback restores the previous schema")
        .textContent,
    ).toContain("No assessments");
    expect(container.textContent).toContain(
      "No external reviewer has assessed this claim.",
    );

    const note = container.querySelector<HTMLInputElement>(
      '[aria-label="Note for Rollback restores the previous schema"]',
    );
    if (!note) {
      throw new Error("The selected claim has no human note field.");
    }
    setControlValue(note, "Recovery rehearsal passed.");
    await click(buttonContaining(container, "Accept"));

    expect(decideClaim).toHaveBeenCalledTimes(1);
    expect(decideClaim).toHaveBeenCalledWith("completion-request", {
      claimId: "rollback",
      decision: "accepted",
      qualification: null,
      rationale: "Recovery rehearsal passed.",
    });

    const decided = {
      ...COMPLETION_REQUEST,
      response: completionResponse(COMPLETION_REQUEST, {
        claimId: "rollback",
        decision: "accepted",
        qualification: null,
        rationale: "Recovery rehearsal passed.",
      }),
    };
    render(
      <ReviewContext.Provider
        value={contextValue(snapshotFor(decided), actions, {
          selection: {
            requestId: "completion-request",
            subjectId: "rollback",
            subjectKind: "claim",
          },
        })}
      >
        <ClaimsSection section={COMPLETION_SECTION} />
      </ReviewContext.Provider>,
    );
    const decidedRow = buttonContaining(
      container,
      "Rollback restores the previous schema",
    );
    const accepted = container.querySelector<HTMLButtonElement>(
      'button[data-decision-kind="accepted"]',
    );
    expect(decidedRow.dataset.decision).toBe("accepted");
    expect(decidedRow.textContent).toContain("✓ Accepted");
    expect(accepted?.getAttribute("aria-pressed")).toBe("true");
    expect(accepted?.disabled).toBe(true);
  });

  it("links a selected matrix factor to its evidence and keeps option selection provisional", async () => {
    const confirmChoice = vi.fn<ReviewActions["confirmChoice"]>(async () => {});
    render(<MatrixWorkflow confirmChoice={confirmChoice} />);

    expect(container.querySelector('[role="status"]')).toBeNull();
    await click(buttonContaining(container, "Reliability"));

    expect(
      buttonContaining(container, "Reliability").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      container.querySelector('[role="status"] [data-role="supports"]')
        ?.textContent,
    ).toBe("supports");
    const citedLines = Array.from(
      container.querySelectorAll<HTMLElement>('[data-cited="true"]'),
    ).map((line) => line.querySelector("span")?.textContent);
    expect(citedLines).toEqual(["12", "13"]);

    await click(buttonContaining(container, "Seven-day rollout"));

    expect(confirmChoice).not.toHaveBeenCalled();
    const confirm = buttonContaining(container, "Confirm choice");
    expect(confirm.disabled).toBe(false);
    await click(confirm);
    expect(confirmChoice).toHaveBeenCalledTimes(1);
    expect(confirmChoice).toHaveBeenCalledWith("rollout-request", "");

    const confirmedRequest = {
      ...MATRIX_REQUEST,
      response: selectedChoiceResponse(MATRIX_REQUEST, ["gradual"], ""),
    };
    render(
      <ReviewContext.Provider
        value={contextValue(snapshotFor(confirmedRequest), createActions(), {
          selectedOptions: { "rollout-request": "gradual" },
        })}
      >
        <ChoiceMatrixSection section={MATRIX_SECTION} />
      </ReviewContext.Provider>,
    );
    const savedChoice = container.querySelector<HTMLButtonElement>(
      'button[data-action-state="confirmed"]',
    );
    expect(savedChoice?.textContent).toContain("Choice confirmed");
    expect(savedChoice?.getAttribute("aria-pressed")).toBe("true");
    expect(savedChoice?.disabled).toBe(true);
    expect(
      container.querySelector("tr[data-confirmed]")?.textContent,
    ).toContain("Your choice");
  });

  it("keeps artifact strokes normalized and accepts revision feedback only with a note or drawing", async () => {
    installControlledResizeObserver();
    const onStroke = vi.fn<ReviewActions["addAnnotationStroke"]>();
    const onRevisionAttempt = vi.fn();
    render(
      <ArtifactWorkflow
        onRevisionAttempt={onRevisionAttempt}
        onStroke={onStroke}
      />,
    );
    loadArtifactImage(container, { height: 300, width: 400 });

    await click(buttonContaining(container, "Request changes"));
    await click(buttonContaining(container, "Send feedback"));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Describe or draw the requested change.",
    );
    expect(onRevisionAttempt).toHaveBeenNthCalledWith(
      1,
      "artifact-request",
      "",
      0,
    );

    const firstRevision = container.querySelector<HTMLTextAreaElement>(
      '[aria-label="Requested changes"]',
    );
    if (!firstRevision) {
      throw new Error("The revision form has no requested changes field.");
    }
    setControlValue(firstRevision, "Increase the inactive-tab contrast.");
    await click(buttonContaining(container, "Send feedback"));

    expect(onRevisionAttempt).toHaveBeenNthCalledWith(
      2,
      "artifact-request",
      "Increase the inactive-tab contrast.",
      0,
    );
    expect(
      container.querySelector('[aria-label="Requested changes"]'),
    ).toBeNull();

    await click(buttonContaining(container, "Request changes"));
    const secondRevision = container.querySelector<HTMLTextAreaElement>(
      '[aria-label="Requested changes"]',
    );
    if (!secondRevision) {
      throw new Error("The revision form did not reopen.");
    }
    setControlValue(secondRevision, "");
    await click(buttonContaining(container, "Draw feedback"));

    const annotationSurface = container.querySelector<SVGSVGElement>(
      '[aria-label="Annotation canvas for Candidate A"]',
    );
    if (!annotationSurface) {
      throw new Error("The candidate has no annotation canvas.");
    }
    expect(annotationSurface.style.left).toBe("0px");
    expect(annotationSurface.style.top).toBe("50px");
    expect(annotationSurface.style.width).toBe("400px");
    expect(annotationSurface.style.height).toBe("200px");
    configureAnnotationSurface(annotationSurface);
    dispatchPointer(annotationSurface, "pointerdown", 90, 170);
    dispatchPointer(annotationSurface, "pointermove", 250, 250);
    dispatchPointer(annotationSurface, "pointerup", 410, 330);

    expect(onStroke).toHaveBeenCalledTimes(1);
    expect(onStroke).toHaveBeenCalledWith("artifact-request", "candidate-a", [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.5 },
      { x: 0.9, y: 0.9 },
    ]);

    await click(buttonContaining(container, "Send feedback"));

    expect(onRevisionAttempt).toHaveBeenNthCalledWith(
      3,
      "artifact-request",
      "",
      1,
    );
    expect(
      container.querySelector('[aria-label="Requested changes"]'),
    ).toBeNull();
  });

  it("tracks contained image resizes and never embeds active artifact types", () => {
    const triggerResize = installControlledResizeObserver();
    const actions = createActions();
    const layout = { height: 300, width: 400 };
    render(
      <ReviewContext.Provider value={contextValue(ARTIFACT_SNAPSHOT, actions)}>
        <ArtifactSection section={ARTIFACT_SECTION} />
      </ReviewContext.Provider>,
    );
    loadArtifactImage(container, layout);

    const annotationSurface = container.querySelector<SVGSVGElement>(
      '[aria-label="Annotation canvas for Candidate A"]',
    );
    if (!annotationSurface) {
      throw new Error("The image artifact has no annotation canvas.");
    }
    expect(annotationSurface.style.cssText).toContain("top: 50px");
    expect(annotationSurface.style.cssText).toContain("height: 200px");

    layout.width = 300;
    triggerResize();
    expect(annotationSurface.style.cssText).toContain("top: 75px");
    expect(annotationSurface.style.cssText).toContain("width: 300px");
    expect(annotationSurface.style.cssText).toContain("height: 150px");

    const download = container.querySelector<HTMLAnchorElement>(
      ".review-artifact-toolbar a",
    );
    expect(download?.textContent).toBe("Download original");
    expect(download?.getAttribute("href")).toBe(
      "/api/evidence/artifact-request/candidate-a?download=1",
    );
    expect(download?.hasAttribute("download")).toBe(true);
    expect(download?.hasAttribute("target")).toBe(false);

    const activeRequest = artifactRequest("text/html");
    render(
      <ReviewContext.Provider
        value={contextValue(snapshotFor(activeRequest), actions)}
      >
        <ArtifactSection section={ARTIFACT_SECTION} />
      </ReviewContext.Provider>,
    );

    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("audio")).toBeNull();
    expect(
      container.querySelector(".review-artifact-file-card")?.textContent,
    ).toContain("text/html");
  });
});
