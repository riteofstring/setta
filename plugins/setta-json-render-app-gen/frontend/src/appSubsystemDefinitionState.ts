import type { AppDefinition } from "./appSubsystemContracts";

import {
  createWithEqualityFn,
  withAppSubsystemResetFn,
} from "./appSubsystemStore";

type AppDefinitionState = {
  appDefinition: AppDefinition | null;
  appSpec: unknown | null;
};

export const useAppDefinition = createWithEqualityFn(
  withAppSubsystemResetFn<AppDefinitionState>(() => ({
    appDefinition: null,
    appSpec: null,
  })),
);
