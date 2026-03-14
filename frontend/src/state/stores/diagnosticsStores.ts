import {
  SettaLspDiagnostic,
  SettaProjectNameValidationErrors,
} from "utils/generatedTypes";
import { immer } from "zustand/middleware/immer";
import { createWithEqualityFn } from "zustand/traditional";
import { withProjectState, withResetFn } from "../utils";

type ZustandTypeErrors = {
  userRequested: boolean;
  errors: Record<
    string,
    {
      callable: Array<string>;
      params: Record<string, Array<string>>;
    }
  >;
};

export const useTypeErrors = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<ZustandTypeErrors>(() => ({
        userRequested: false,
        errors: {},
      })),
    ),
  ),
);

type ZustandLspDiagnostics = {
  codeSections: Record<string, Array<SettaLspDiagnostic>>;
  unmappedGenCode: Array<SettaLspDiagnostic>;
};

export const useLspDiagnostics = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<ZustandLspDiagnostics>(() => ({
        codeSections: {},
        unmappedGenCode: [],
      })),
    ),
  ),
);

type ZustandNameValidationErrors = {
  pendingByProjectId: Record<string, SettaProjectNameValidationErrors>;
  projectErrors: Array<string>;
  sectionErrors: Record<string, Array<string>>;
  paramErrors: Record<string, Array<string>>;
};

export const useNameValidationErrors = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<ZustandNameValidationErrors>(() => ({
        pendingByProjectId: {},
        projectErrors: [],
        sectionErrors: {},
        paramErrors: {},
      })),
    ),
  ),
);
