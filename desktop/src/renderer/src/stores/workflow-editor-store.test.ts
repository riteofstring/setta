import { afterEach, describe, expect, test, vi } from "vitest";

import {
  workflowDefinitionChangedDetail,
  workflowDefinitionChangedEventName,
} from "./workflow-definition-invalidation";
import { useWorkflowEditorStore } from "./workflow-editor-store";

describe("workflow editor store", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("notifies workflow definition invalidation through the app-level event", () => {
    const windowTarget = new EventTarget();
    const events: Event[] = [];
    windowTarget.addEventListener(workflowDefinitionChangedEventName, (event) => {
      events.push(event);
    });
    vi.stubGlobal("window", windowTarget);

    useWorkflowEditorStore
      .getState()
      .notifyWorkflowDefinitionChanged("workspace_graph", "definition_graph");

    expect(events).toHaveLength(1);
    expect(workflowDefinitionChangedDetail(events[0]!)).toEqual({
      definitionId: "definition_graph",
      workspaceId: "workspace_graph",
    });
  });
});
