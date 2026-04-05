import type { HttpapiProjectStateSingleConfigWithCompletedOpIds } from "openapi/http";
import { createSingleConfig, type SingleConfig } from "utils/generatedTypes";

export type ProjectStateBackendUpdate =
  HttpapiProjectStateSingleConfigWithCompletedOpIds;

export function createProjectStateBackendUpdate(
  options: {
    projectState?: Partial<SingleConfig>;
    completedOpIds?: Array<string>;
    pendingOpIds?: Array<string>;
  } = {},
): ProjectStateBackendUpdate {
  const { projectState = {}, completedOpIds = [], pendingOpIds = [] } = options;

  return {
    projectState: createSingleConfig(projectState),
    completedOpIds,
    pendingOpIds,
  };
}
