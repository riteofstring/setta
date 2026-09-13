import type {
  ApplicationSnapshotV1,
  CaseResultV1,
  ProjectV1,
  RunV1,
} from "./backend/generatedContract";

function caseResult(
  runId: string,
  sha256: string,
  byteLength: number,
): CaseResultV1 {
  return {
    artifacts: [
      {
        byteLength,
        id: `${runId}-sunset-thumbnail`,
        mediaType: "image/png",
        name: "thumbnail",
        sha256,
      },
    ],
    caseId: "sunset-bottle",
    caseName: "Sunset bottle",
    completedAt: "2026-09-12T18:00:01Z",
    durationMilliseconds: 420,
    error: null,
    findings: [
      {
        checkId: "dimensions",
        checkName: "Exactly 512 × 512",
        message: "Image dimensions are 512 × 512.",
        status: "passed",
      },
    ],
    message: "Complete",
    observations: [
      {
        booleanValue: null,
        id: "coverage",
        kind: "number",
        name: "Coverage",
        numberValue: runId === "run-cover" ? 1 : 0.74,
        textValue: null,
      },
    ],
    output: { height: 512, mode: runId.slice(4), width: 512 },
    progress: 1,
    startedAt: "2026-09-12T18:00:00Z",
    status: "succeeded",
    stderr: "",
    stderrTruncated: false,
  };
}

export function makeBenchProject(): ProjectV1 {
  return {
    candidates: [
      {
        command: {
          argv: ["thumbnail-candidate", "run", "--mode", "contain"],
          workingDirectory: ".",
        },
        id: "contain",
        name: "Contain",
        origin: null,
      },
      {
        command: {
          argv: ["thumbnail-candidate", "run", "--mode", "cover"],
          workingDirectory: ".",
        },
        id: "cover",
        name: "Cover",
        origin: null,
      },
    ],
    caseSet: {
      id: "catalog-images",
      manifest: "cases.jsonl",
      name: "Colorful catalog images",
    },
    evaluator: {
      checks: [
        {
          artifactName: "thumbnail",
          height: null,
          id: "file-size",
          kind: "artifact_max_bytes",
          maximumBytes: 160_000,
          name: "PNG is under 160 KB",
          width: null,
        },
        {
          artifactName: "thumbnail",
          height: 512,
          id: "dimensions",
          kind: "image_dimensions",
          maximumBytes: null,
          name: "Exactly 512 × 512",
          width: 512,
        },
      ],
      id: "thumbnail-quality",
      name: "Thumbnail quality",
    },
    execution: { concurrency: 2, timeoutMilliseconds: 10_000 },
    id: "product-thumbnails",
    name: "Product thumbnail strategies",
    presentation: {
      sections: {
        "catalog-images": {
          height: 240,
          width: 300,
          x: 40,
          y: 160,
          zIndex: 1,
        },
        contain: {
          height: 180,
          width: 320,
          x: 440,
          y: 40,
          zIndex: 2,
        },
        cover: {
          height: 180,
          width: 320,
          x: 440,
          y: 300,
          zIndex: 3,
        },
        "thumbnail-quality": {
          height: 240,
          width: 320,
          x: 860,
          y: 160,
          zIndex: 4,
        },
      },
      viewport: { x: 80, y: 70, zoom: 0.85 },
    },
    revision: 3,
    version: 1,
  };
}

function completedRun(
  id: string,
  candidateId: string,
  candidateName: string,
  sha256: string,
  byteLength: number,
): RunV1 {
  return {
    candidateId,
    candidateName,
    caseResults: [caseResult(id, sha256, byteLength)],
    completedAt: "2026-09-12T18:00:01Z",
    createdAt: "2026-09-12T18:00:00Z",
    error: null,
    id,
    launchId: "launch-1",
    rerunParentId: null,
    startedAt: "2026-09-12T18:00:00Z",
    status: "completed",
    version: 1,
  };
}

export function makeBenchSnapshot(): ApplicationSnapshotV1 {
  const project = makeBenchProject();
  const cases = [
    {
      expected: { height: 512, width: 512 },
      id: "sunset-bottle",
      input: { path: "inputs/product-01.png" },
      name: "Sunset bottle",
    },
  ];
  return {
    cases,
    diagnostics: [],
    launches: [
      {
        candidates: project.candidates,
        cases,
        caseSet: project.caseSet,
        createdAt: "2026-09-12T18:00:00Z",
        evaluator: project.evaluator,
        execution: project.execution,
        id: "launch-1",
        projectId: project.id,
        projectRevision: project.revision,
        rerunParentRunId: null,
        runIds: ["run-cover", "run-contain"],
        version: 1,
      },
    ],
    project,
    reviews: [],
    runs: [
      completedRun("run-cover", "cover", "Cover", "b".repeat(64), 145_000),
      completedRun("run-contain", "contain", "Contain", "a".repeat(64), 98_000),
    ],
    validation: {
      caseCount: 1,
      executionCount: 2,
      issues: [],
      ready: true,
    },
    version: "bench-snapshot/v1",
  };
}
