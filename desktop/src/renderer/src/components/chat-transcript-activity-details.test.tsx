import type { RunActivityDetailsProjection } from "@generated/backend";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  ActivityApprovalDetails,
  ActivityPlanDetails,
  ActivityProviderStreamLifecycleDetails,
} from "./chat-transcript-activity-details";

describe("ActivityPlanDetails", () => {
  test("renders typed plan steps", () => {
    const html = renderToString(<ActivityPlanDetails details={planDetails()} />);

    expect(html).toContain("Updating the turn plan.");
    expect(html).toContain("Done");
    expect(html).toContain("Read the plan");
    expect(html).toContain("Active");
    expect(html).toContain("Implement the typed contract");
    expect(html).toContain("Pending");
    expect(html).toContain("Render the active surface");
    expect(html).not.toContain('data-testid="open-current-plan-surface"');
  });

  test("renders current-plan surface action for active plan details", () => {
    const html = renderToString(
      <ActivityPlanDetails
        currentPlanSurfaceAction={{
          onOpenCurrentPlanSurface: () => {},
          runId: "run_plan",
          sourceRunItemId: "run_item_plan",
        }}
        details={planDetails()}
      />,
    );

    expect(html).toContain('data-testid="open-current-plan-surface"');
    expect(html).toContain('aria-label="Open current plan"');
  });
});

describe("ActivityApprovalDetails", () => {
  test("renders typed approval request details", () => {
    const html = renderToString(<ActivityApprovalDetails details={approvalDetails()} />);

    expect(html).toContain("Command approval");
    expect(html).toContain("request_1");
    expect(html).toContain("go test ./...");
  });
});

describe("ActivityProviderStreamLifecycleDetails", () => {
  test("renders typed provider stream lifecycle details", () => {
    const html = renderToString(
      <ActivityProviderStreamLifecycleDetails details={providerStreamLifecycleDetails()} />,
    );

    expect(html).toContain("stream disconnected before completion");
    expect(html).toContain("responseStreamDisconnected");
    expect(html).toContain("provider_unavailable");
    expect(html).toContain("thread_provider");
  });
});

function planDetails(): RunActivityDetailsProjection {
  return baseDetails({
    plan: {
      explanation: "Updating the turn plan.",
      steps: [
        { status: "completed", step: "Read the plan" },
        { status: "inProgress", step: "Implement the typed contract" },
        { status: "pending", step: "Render the active surface" },
      ],
    },
  });
}

function approvalDetails(): RunActivityDetailsProjection {
  return baseDetails({
    approval: {
      action: null,
      actionType: "",
      approvalId: "approval_1",
      approvalKind: "command",
      approvalStatus: "pending",
      body: "Command approval",
      command: "go test ./...",
      cwd: "/workspace",
      filePath: "",
      options: [],
      permission: "",
      providerRequestId: "request_1",
      question: "",
      questions: [],
      review: null,
      reviewId: "",
      reviewStatus: "",
      structuredInput: null,
      title: "Command approval",
    },
  });
}

function providerStreamLifecycleDetails(): RunActivityDetailsProjection {
  return baseDetails({
    providerStreamLifecycle: {
      additionalDetails: "fake response stream disconnect",
      codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: null } },
      codexErrorKind: "responseStreamDisconnected",
      livenessReason: "provider_unavailable",
      livenessStatus: "lost",
      message: "stream disconnected before completion",
      providerThreadId: "thread_provider",
      providerTurnId: "turn_provider",
      streamFailure: true,
      willRetry: false,
    },
  });
}

function baseDetails(
  overrides: Partial<RunActivityDetailsProjection> = {},
): RunActivityDetailsProjection {
  return {
    command: "",
    commandExecution: null,
    commandStartFailure: null,
    approval: null,
    cwd: "",
    details: null,
    diff: null,
    durationMs: 0,
    error: "",
    exitCode: 0,
    fileChange: null,
    filePaths: [],
    mcpToolCall: null,
    namespace: "",
    noticeKind: "",
    noticeMessage: "",
    patchStatus: "",
    plan: null,
    processId: "",
    providerStreamLifecycle: null,
    progress: "",
    requestId: "",
    result: "",
    reviewId: "",
    serverName: "",
    summary: "",
    toolName: "",
    ...overrides,
  };
}
