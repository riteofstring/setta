import { callOpenAPI, res200 } from "@setta/app-subsystem-frontend-sdk";
import { redo, undo } from "openapi/http";
import { useMisc } from "state/definitions";
import {
  getCurrProjectConfigId,
  processProjectStateUpdateFromBackend,
} from "./sectionInfos";

async function applyProjectHistoryMutation(routeFn: typeof undo | typeof redo) {
  const response = await callOpenAPI(
    routeFn({
      body: {
        steps: 1,
        projectConfigId: getCurrProjectConfigId(),
      },
    } as Parameters<typeof routeFn>[0]),
  );
  if (!res200(response)) {
    return;
  }
  processProjectStateUpdateFromBackend(response.data);
  useMisc.setState({ undoOrRedoWasTriggered: true });
}
export function undoProjectState() {
  void applyProjectHistoryMutation(undo);
}
export function redoProjectState() {
  void applyProjectHistoryMutation(redo);
}
