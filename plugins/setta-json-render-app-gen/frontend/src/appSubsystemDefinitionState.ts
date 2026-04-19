import type { AppDefinition } from "./appSubsystemContracts";

import { withProjectState, withResetFn } from "state/utils";
import { createWithEqualityFn } from "utils/zustandTraditional";

type AppDefinitionState = {
  appDefinition: AppDefinition | null;
  appSpec: unknown | null;
};

export const useAppDefinition = withProjectState(
  createWithEqualityFn(
    withResetFn<AppDefinitionState>(() => ({
      appDefinition: null,
      appSpec: null,
    })),
  ),
);
