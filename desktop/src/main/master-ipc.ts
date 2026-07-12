import type { IpcMain } from "electron";

import type {
  ActiveShellInteraction,
  BackendClient,
  ShellInteractionState,
} from "@generated/backend";
import { handleIpc, type IpcObserver } from "@shared/ipc";
import type { RoutingObservationRecorder } from "./routing-observability";

interface MasterIpcRegistration {
  ipcMain: Pick<IpcMain, "handle">;
  ipcObserver?: IpcObserver;
  requireBackendClient: () => BackendClient;
  routingObservability?: RoutingObservationRecorder;
}

export function registerMasterIpcHandlers({
  ipcMain,
  ipcObserver,
  requireBackendClient,
  routingObservability,
}: MasterIpcRegistration): void {
  const observedMasterInputIds = new Set<string>();
  handleIpc(
    ipcMain,
    "masterReadActiveInteraction",
    async () => {
      const backend = requireBackendClient();
      const interaction = await backend.readActiveMasterShellInteraction();
      await observeMasterInteraction(
        backend,
        routingObservability,
        observedMasterInputIds,
        interaction,
      );
      return interaction;
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "masterResolvePresentation",
    async (_event, request) => requireBackendClient().resolveMasterPresentationIntent(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "masterSubmitInput",
    async (_event, request) => requireBackendClient().submitMasterInput(request),
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "masterWaitInteraction",
    async (_event, request) => {
      const backend = requireBackendClient();
      const state = await backend.waitMasterShellInteraction(request);
      await observeMasterInteraction(backend, routingObservability, observedMasterInputIds, {
        state,
      });
      return state;
    },
    ipcObserver,
  );
  handleIpc(
    ipcMain,
    "masterWaitPresentation",
    async (_event, request) => {
      const backend = requireBackendClient();
      const intent = await backend.waitMasterPresentationIntent(request);
      await observeMasterInput(
        backend,
        routingObservability,
        observedMasterInputIds,
        request.inputId,
      );
      routingObservability?.recordMasterPresentationIntent(intent);
      return intent;
    },
    ipcObserver,
  );
}

async function observeMasterInteraction(
  backend: BackendClient,
  routingObservability: RoutingObservationRecorder | undefined,
  observedMasterInputIds: Set<string>,
  interaction: ActiveShellInteraction,
): Promise<void> {
  const state = interaction.state;
  if (routingObservability === undefined || state === null || !settledMasterInteraction(state)) {
    return;
  }
  await observeMasterInput(backend, routingObservability, observedMasterInputIds, state.input.id);
}

async function observeMasterInput(
  backend: BackendClient,
  routingObservability: RoutingObservationRecorder | undefined,
  observedMasterInputIds: Set<string>,
  inputId: string,
): Promise<void> {
  if (routingObservability === undefined || observedMasterInputIds.has(inputId)) {
    return;
  }
  try {
    const routingState = await backend.readMasterInputRoutingState({ inputId });
    routingObservability.recordMasterInputRoutingState(routingState);
    observedMasterInputIds.add(inputId);
  } catch (error) {
    routingObservability.recordRoutingObservationFailure("master", inputId, error);
  }
}

function settledMasterInteraction(state: ShellInteractionState): boolean {
  switch (state.status) {
    case "accepted":
    case "routing":
      return false;
    case "decided":
    case "failed":
      return true;
    default:
      return assertNever(state.status);
  }
}

function assertNever(value: never): never {
  throw new Error(`unsupported master interaction status: ${String(value)}`);
}
