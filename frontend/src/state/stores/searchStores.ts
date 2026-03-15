import {
  ProjectSearchMode,
  ProjectSearchModeEnum,
} from "utils/constants";
import { createWithEqualityFn } from "zustand/traditional";
import { withProjectState, withResetFn } from "../utils";

export const useHomePageSearch = createWithEqualityFn(
  withResetFn(() => ({
    value: "",
  })),
);

export type ZustandProjectSearch = {
  codeInfo: Array<{
    sectionId: string;
    paramInfoId: string;
    name: string;
  }>;
  focused: {
    sectionId: string;
    paramInfoId: string;
    name: string;
  } | null;
  lookup: Set<string>;
  mode: ProjectSearchMode;
};

export const useProjectSearch = withProjectState(
  createWithEqualityFn(
    withResetFn<ZustandProjectSearch>(() => ({
      codeInfo: [],
      focused: null,
      lookup: new Set(),
      mode: ProjectSearchModeEnum.find,
    })),
  ),
);
