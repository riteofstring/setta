type HtmlSurfaceApiProbeName =
  | "core-html-in-canvas-apis"
  | "copy-element-image-to-texture-overloads"
  | "direct-canvas-child-upload"
  | "css-transform-capture"
  | "css-transform-hit-testing"
  | "transform-only-paint-invalidation"
  | "overlapping-passive-source-capture"
  | "hidden-source-capture-policy"
  | "source-subrect-upload"
  | "get-element-transform"
  | "paint-changed-elements"
  | "draw-element-image-transform"
  | "capture-element-image-worker";

type HtmlSurfaceApiProbeStatus = "fail" | "pass" | "unsupported";

type HtmlSurfaceApiProbeRequirement = "documented" | "required";

export type HtmlSurfaceApiProbeResult = {
  readonly details?: string | undefined;
  readonly error?: string | undefined;
  readonly metrics?:
    | Readonly<Record<string, boolean | number | string>>
    | undefined;
  readonly name: HtmlSurfaceApiProbeName;
  readonly requirement: HtmlSurfaceApiProbeRequirement;
  readonly status: HtmlSurfaceApiProbeStatus;
};

type HtmlSurfaceApiProbeSummary = {
  readonly failedRequiredProbeNames: readonly HtmlSurfaceApiProbeName[];
  readonly failedRequiredProbes: readonly HtmlSurfaceApiProbeResult[];
  readonly passCount: number;
  readonly results: readonly HtmlSurfaceApiProbeResult[];
  readonly unsupportedRequiredProbeNames: readonly HtmlSurfaceApiProbeName[];
};

type HtmlSurfaceSourcePolicyIssue =
  | "not-direct-canvas-child"
  | "missing-layout-box"
  | "display-none"
  | "visibility-hidden"
  | "opacity-zero"
  | "parked-offscreen"
  | "clip-path-hidden";

type HtmlSurfaceSourcePolicyResult = {
  readonly issues: readonly HtmlSurfaceSourcePolicyIssue[];
  readonly ok: boolean;
};

export class HtmlSurfaceApiProbeError extends Error {
  readonly summary: HtmlSurfaceApiProbeSummary;

  constructor(summary: HtmlSurfaceApiProbeSummary) {
    super(formatHtmlSurfaceApiProbeError(summary));
    this.name = "HtmlSurfaceApiProbeError";
    this.summary = summary;
  }
}

export function summarizeHtmlSurfaceApiProbeResults(
  results: readonly HtmlSurfaceApiProbeResult[],
): HtmlSurfaceApiProbeSummary {
  const failedRequiredProbes = results.filter(
    (result) => result.requirement === "required" && result.status !== "pass",
  );
  return {
    failedRequiredProbeNames: failedRequiredProbes
      .filter((result) => result.status === "fail")
      .map((result) => result.name),
    failedRequiredProbes,
    passCount: results.filter((result) => result.status === "pass").length,
    results,
    unsupportedRequiredProbeNames: failedRequiredProbes
      .filter((result) => result.status === "unsupported")
      .map((result) => result.name),
  };
}

export function assertHtmlSurfaceApiProbesPassed(
  summary: HtmlSurfaceApiProbeSummary,
) {
  if (summary.failedRequiredProbes.length > 0) {
    throw new HtmlSurfaceApiProbeError(summary);
  }
}

export function evaluateHtmlSurfaceSourcePolicy(
  canvas: HTMLCanvasElement,
  source: HTMLElement,
): HtmlSurfaceSourcePolicyResult {
  const issues: HtmlSurfaceSourcePolicyIssue[] = [];
  appendDirectChildPolicyIssues(issues, canvas, source);
  appendStylePolicyIssues(issues, source);
  appendBoxPolicyIssues(issues, source);

  return {
    issues,
    ok: issues.length === 0,
  };
}

function appendDirectChildPolicyIssues(
  issues: HtmlSurfaceSourcePolicyIssue[],
  canvas: HTMLCanvasElement,
  source: HTMLElement,
) {
  if (source.parentElement !== canvas) {
    issues.push("not-direct-canvas-child");
  }
}

function appendStylePolicyIssues(
  issues: HtmlSurfaceSourcePolicyIssue[],
  source: HTMLElement,
) {
  const style = globalThis.getComputedStyle?.(source);
  const checks: readonly [HtmlSurfaceSourcePolicyIssue, boolean][] = [
    ["display-none", style?.display === "none"],
    ["visibility-hidden", style?.visibility === "hidden"],
    ["opacity-zero", style?.opacity.trim() === "0"],
    ["clip-path-hidden", Boolean(style?.clipPath && style.clipPath !== "none")],
  ];
  for (const [issue, applies] of checks) {
    if (applies) {
      issues.push(issue);
    }
  }
}

function appendBoxPolicyIssues(
  issues: HtmlSurfaceSourcePolicyIssue[],
  source: HTMLElement,
) {
  const rect = source.getBoundingClientRect();
  if (sourceHasNoLayoutBox(source, rect)) {
    issues.push("missing-layout-box");
  }
  if (isParkedOffscreen(source, rect)) {
    issues.push("parked-offscreen");
  }
}

function sourceHasNoLayoutBox(source: HTMLElement, rect: DOMRect): boolean {
  return (
    rect.width <= 0 || rect.height <= 0 || source.getClientRects().length === 0
  );
}

function isParkedOffscreen(source: HTMLElement, rect: DOMRect): boolean {
  const style = globalThis.getComputedStyle?.(source);
  const left = Number.parseFloat(style?.left ?? "");
  const top = Number.parseFloat(style?.top ?? "");
  return rect.right < 0 || rect.bottom < 0 || left <= -1_000 || top <= -1_000;
}

function formatHtmlSurfaceApiProbeError(
  summary: HtmlSurfaceApiProbeSummary,
): string {
  const probeNames = summary.failedRequiredProbes
    .map(
      (result) =>
        `${result.name}: ${result.error ?? result.details ?? result.status}`,
    )
    .join("; ");
  return `Setta HTML surface required browser probes failed: ${probeNames}`;
}
