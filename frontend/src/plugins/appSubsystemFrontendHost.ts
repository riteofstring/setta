import {
  createAppSubsystemFrontendHost,
  type AppSubsystemFrontendHost,
  type AppSubsystemNotification,
  type AppSubsystemProjectContext,
} from "@setta/app-subsystem-frontend-sdk";
import { closeModal } from "state/actions/modal";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  NULL_PROJECT_CONFIG_ID,
  useAllProjectMetadata,
  useProjectState,
} from "state/definitions";
import { NotificationTypeEnum } from "utils/generatedTypes";

function buildAppSubsystemProjectContext(): AppSubsystemProjectContext {
  const projectMetadataState = useAllProjectMetadata.getState();
  const projectConfig = useProjectState.getState().projectConfig;

  return {
    defaultProjectConfigId: projectMetadataState.defaultProjectConfigId,
    projectMetadata: projectMetadataState.projectMetadata.map((entry) => ({
      id: entry.id,
      name: entry.name,
    })),
    projectConfig: {
      id: projectConfig.id === NULL_PROJECT_CONFIG_ID ? null : projectConfig.id,
      name: projectConfig.name,
      entryCodeBlockId: projectConfig.entryCodeBlockId ?? null,
    },
  };
}

function sameAppSubsystemProjectContext(
  left: AppSubsystemProjectContext,
  right: AppSubsystemProjectContext,
): boolean {
  if (left.defaultProjectConfigId !== right.defaultProjectConfigId) {
    return false;
  }
  if (
    left.projectConfig.id !== right.projectConfig.id ||
    left.projectConfig.name !== right.projectConfig.name ||
    left.projectConfig.entryCodeBlockId !== right.projectConfig.entryCodeBlockId
  ) {
    return false;
  }
  if (left.projectMetadata.length !== right.projectMetadata.length) {
    return false;
  }
  return left.projectMetadata.every((entry, index) => {
    const other = right.projectMetadata[index];
    return entry.id === other?.id && entry.name === other?.name;
  });
}

const appSubsystemProjectContextListeners = new Set<
  (projectContext: AppSubsystemProjectContext) => void
>();

let currentAppSubsystemProjectContext = buildAppSubsystemProjectContext();

function syncAppSubsystemProjectContext(): void {
  const nextProjectContext = buildAppSubsystemProjectContext();
  if (
    sameAppSubsystemProjectContext(
      currentAppSubsystemProjectContext,
      nextProjectContext,
    )
  ) {
    return;
  }
  currentAppSubsystemProjectContext = nextProjectContext;
  for (const listener of appSubsystemProjectContextListeners) {
    listener(nextProjectContext);
  }
}

useProjectState.subscribe(syncAppSubsystemProjectContext);
useAllProjectMetadata.subscribe(syncAppSubsystemProjectContext);

function addAppSubsystemNotification(
  notification: AppSubsystemNotification,
): void {
  addTemporaryNotification(
    notification.message,
    notification.type ?? NotificationTypeEnum.info,
  );
}

export function createRuntimeAppSubsystemFrontendHost(
  overrides: Partial<AppSubsystemFrontendHost> = {},
): AppSubsystemFrontendHost {
  return createAppSubsystemFrontendHost({
    closeModal,
    notify: addAppSubsystemNotification,
    getProjectContext: () => currentAppSubsystemProjectContext,
    subscribeProjectContext: (
      listener: (projectContext: AppSubsystemProjectContext) => void,
    ) => {
      appSubsystemProjectContextListeners.add(listener);
      return () => {
        appSubsystemProjectContextListeners.delete(listener);
      };
    },
    ...overrides,
  });
}

export const DEFAULT_APP_SUBSYSTEM_FRONTEND_HOST =
  createRuntimeAppSubsystemFrontendHost();
