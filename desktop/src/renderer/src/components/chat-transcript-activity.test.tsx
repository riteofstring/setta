import type { RunItemOutput, TranscriptBlock } from "@generated/backend";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, test } from "vitest";

import { activityDetails } from "../App.test.fixtures";
import { activityBlock } from "../stores/chat-store-events.test.helpers";
import { useAppearanceStore } from "../stores/appearance-store";
import { useChatStore } from "../stores/chat-store";
import type { CurrentPlanSurfaceTarget } from "./chat-current-plan-surface";
import { ChatTranscript } from "./chat-transcript";

const noop = async () => {};

beforeEach(() => {
  useAppearanceStore.setState(useAppearanceStore.getInitialState(), true);
  useChatStore.setState(useChatStore.getInitialState(), true);
});

describe("ChatTranscript activity rows", () => {
  test("renders opened activity rows as structured transcript details", () => {
    const html = renderToString(
      <TestChatTranscript
        blocks={[
          activityBlock({
            id: "block_cmd_a",
            runId: "run_api",
            ordinal: 1,
            sourceRunItemId: "item_command",
            hasDetails: true,
            hasOutput: true,
            details: activityDetails({
              command: "pnpm test -- --runInBand",
              commandExecution: {
                command: "pnpm test -- --runInBand",
                cwd: "/workspace",
                durationMs: 1234,
                error: "1 failed",
                exitCode: 1,
                processId: "process_1",
                result: "3 passed",
                source: "agent",
              },
              cwd: "/workspace",
              filePaths: ["desktop/src/renderer/src/components/chat-transcript-activity.tsx"],
              processId: "process_1",
              requestId: "request_1",
              summary: "Ran the renderer checks.",
            }),
          }),
          activityBlock({
            id: "block_cmd_b",
            runId: "run_api",
            ordinal: 2,
            sourceRunItemId: "item_other",
            hasDetails: true,
            details: activityDetails({ command: "sed -n 1p setup.sh" }),
          }),
        ]}
        focusedSourceRunItemId="item_command"
        runItemOutputs={[
          {
            createdAt: "2026-05-29T20:00:00Z",
            id: "output_1",
            ordinal: 1,
            runItemId: "item_command",
            schemaVersion: 1,
            stream: "stdout",
            text: "renderer output",
          },
        ]}
      />,
    );

    expect(html).toContain('data-testid="activity-group-header"');
    expect(html).toContain('data-activity-group-expanded="true"');
    expect(rowCount(html, "activity-group-expand-all")).toBe(1);
    expect(html).toContain('aria-label="Expand all activity details"');
    expect(rowCount(html, "activity-group-member-row")).toBe(2);
    expect(rowCount(html, "run-activity-details")).toBe(1);
    expect(html).toContain('data-activity-detail-section="Command"');
    expect(html).toContain('data-activity-detail-section="Cwd"');
    expect(html).toContain('data-activity-detail-section="Metadata"');
    expect(html).toContain('data-activity-detail-section="Files"');
    expect(html).toContain('data-activity-detail-section="Summary"');
    expect(html).toContain('data-activity-detail-section="Result"');
    expect(html).toContain('data-activity-detail-section="Error"');
    expect(html).toContain('data-activity-detail-section="Output"');
    expect(html).toContain('data-activity-detail-kind="pre"');
    expect(html).toContain("<pre");
    expect(html).toContain("max-h-32");
    expect(html).toContain("pnpm");
    expect(html).toContain("--runInBand");
    expect(html).toContain("/workspace");
    expect(html).toContain("request_1");
    expect(html).toContain("renderer output");
  });

  test("links the active typed plan row to the current-plan surface", () => {
    const html = renderToString(
      <TestChatTranscript
        activeCurrentPlanTarget={{ runId: "run_api", sourceRunItemId: "item_active_plan" }}
        blocks={[
          activityBlock({
            id: "block_stale_plan",
            runId: "run_api",
            ordinal: 1,
            sourceRunItemId: "item_stale_plan",
            type: "plan",
            hasDetails: true,
            details: activityDetails({
              plan: {
                explanation: "",
                steps: [{ status: "completed", step: "Historical plan" }],
              },
            }),
          }),
          activityBlock({
            id: "block_active_plan",
            runId: "run_api",
            ordinal: 2,
            sourceRunItemId: "item_active_plan",
            type: "plan",
            hasDetails: true,
            details: activityDetails({
              plan: {
                explanation: "Planning the active turn.",
                steps: [{ status: "inProgress", step: "Open the current-plan surface" }],
              },
            }),
          }),
        ]}
        focusedSourceRunItemId="item_active_plan"
        onOpenCurrentPlanSurface={() => {}}
        runItemOutputs={[]}
      />,
    );

    expect(rowCount(html, "activity-group-member-row")).toBe(2);
    expect(rowCount(html, "open-current-plan-surface")).toBe(1);
    expect(html).toContain("Open the current-plan surface");
    expect(html).toContain('aria-label="Open current plan"');
  });

  test("does not render the current-plan row action without an open handler", () => {
    const html = renderToString(
      <TestChatTranscript
        activeCurrentPlanTarget={{ runId: "run_api", sourceRunItemId: "item_active_plan" }}
        blocks={[
          activityBlock({
            id: "block_active_plan",
            runId: "run_api",
            ordinal: 1,
            sourceRunItemId: "item_active_plan",
            type: "plan",
            hasDetails: true,
            details: activityDetails({
              plan: {
                explanation: "Planning the active turn.",
                steps: [{ status: "inProgress", step: "Open the current-plan surface" }],
              },
            }),
          }),
        ]}
        focusedSourceRunItemId="item_active_plan"
        runItemOutputs={[]}
      />,
    );

    expect(rowCount(html, "open-current-plan-surface")).toBe(0);
  });
});

function TestChatTranscript({
  activeCurrentPlanTarget = null,
  blocks,
  focusedSourceRunItemId,
  onOpenCurrentPlanSurface,
  runItemOutputs,
}: {
  activeCurrentPlanTarget?: { runId: string; sourceRunItemId: string } | null;
  blocks: TranscriptBlock[];
  focusedSourceRunItemId: string;
  onOpenCurrentPlanSurface?: (target: CurrentPlanSurfaceTarget) => void;
  runItemOutputs: RunItemOutput[];
}) {
  const outputMaps = chatTranscriptOutputMaps(runItemOutputs);
  return (
    <ChatTranscript
      activeRun={null}
      activeRunLiveness={null}
      activeCurrentPlanTarget={activeCurrentPlanTarget}
      blocks={blocks}
      conversationKey="conversation_test"
      editQueuedMessage={noop}
      editingQueuedMessageId={null}
      focusedSourceRunItemId={focusedSourceRunItemId}
      hasMoreOlder={false}
      loadOlder={noop}
      loadRunItemOutput={noop}
      messages={[]}
      operation={null}
      queuedMessages={[]}
      removeQueuedMessage={noop}
      removingQueuedMessageId={null}
      runItemOutputIdsByRunItemId={outputMaps.runItemOutputIdsByRunItemId}
      runItemOutputPagesByRunItemId={{}}
      runItemOutputsById={outputMaps.runItemOutputsById}
      sendSteeringImmediately={noop}
      onOpenCurrentPlanSurface={onOpenCurrentPlanSurface}
      submitApproval={noop}
    />
  );
}

function chatTranscriptOutputMaps(outputs: RunItemOutput[]) {
  const runItemOutputsById: Record<string, RunItemOutput> = {};
  const runItemOutputIdsByRunItemId: Record<string, string[]> = {};
  for (const output of outputs) {
    runItemOutputsById[output.id] = output;
    runItemOutputIdsByRunItemId[output.runItemId] = [
      ...(runItemOutputIdsByRunItemId[output.runItemId] ?? []),
      output.id,
    ];
  }
  return { runItemOutputIdsByRunItemId, runItemOutputsById };
}

function rowCount(html: string, testId: string) {
  return html.split(`data-testid="${testId}"`).length - 1;
}
