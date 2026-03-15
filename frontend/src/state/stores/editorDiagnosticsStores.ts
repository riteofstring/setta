import {
  SettaLspDiagnostic,
  SettaProjectNameValidationErrors,
} from "utils/generatedTypes";
import { immer } from "zustand/middleware/immer";
import { createWithEqualityFn } from "zustand/traditional";
import { withProjectState, withResetFn } from "../utils";

type WaitingForLSPResultState = {
  textFields: Record<string, boolean>;
  parametersRequest: Record<string, boolean>;
};

// keys for textFields are of the form:
// {sectionId}-null for the main section combobox
// {sectionId}-{paramInfoId} for section parameter fields
export const useWaitingForLSPResult = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<WaitingForLSPResultState>(() => ({
        textFields: {},
        parametersRequest: {},
      })),
    ),
  ),
);

type TypeErrorsState = {
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
      withResetFn<TypeErrorsState>(() => ({
        userRequested: false,
        errors: {},
      })),
    ),
  ),
);

type LspDiagnosticsState = {
  codeSections: Record<string, Array<SettaLspDiagnostic>>;
  unmappedGenCode: Array<SettaLspDiagnostic>;
};

export const useLspDiagnostics = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<LspDiagnosticsState>(() => ({
        codeSections: {},
        unmappedGenCode: [],
      })),
    ),
  ),
);

type NameValidationErrorsState = {
  pendingByProjectId: Record<string, SettaProjectNameValidationErrors>;
  projectErrors: Array<string>;
  sectionErrors: Record<string, Array<string>>;
  paramErrors: Record<string, Array<string>>;
};

export const useNameValidationErrors = withProjectState(
  createWithEqualityFn(
    immer(
      withResetFn<NameValidationErrorsState>(() => ({
        pendingByProjectId: {},
        projectErrors: [],
        sectionErrors: {},
        paramErrors: {},
      })),
    ),
  ),
);
