import { shouldShowPasswordReveal } from "@setta/app-subsystem-frontend-sdk";
import type { GpuRetainedContentControlDescriptor } from "gpuFlow/retainedContentScene";
import type { PasswordParamCodeObjImpl } from "utils/generatedTypes";
import { toProjectGpuParamDisplayValue } from "./projectGpuParamDisplayValue";
import {
  getProjectGpuRetainedPasswordRevealKey,
  type ProjectGpuRetainedPasswordRevealStateMap,
} from "./projectGpuRetainedParamPasswordRevealState";

export function createProjectGpuPasswordControlDescriptor({
  codeObjImpl,
  controlKind,
  isDeploymentMode,
  passwordRevealStates,
  rowId,
  sectionId,
}: {
  readonly codeObjImpl: PasswordParamCodeObjImpl;
  readonly controlKind: string;
  readonly isDeploymentMode: boolean;
  readonly passwordRevealStates?:
    | ProjectGpuRetainedPasswordRevealStateMap
    | undefined;
  readonly rowId: string;
  readonly sectionId: string;
}): GpuRetainedContentControlDescriptor {
  const displayValue = toProjectGpuParamDisplayValue(codeObjImpl.value);
  const hasSecret = codeObjImpl.hasSecret === true;
  const revealAvailable = getProjectGpuPasswordRevealAvailable({
    displayValue,
    hasSecret,
    isDeploymentMode,
  });
  const revealState = passwordRevealStates?.get(
    getProjectGpuRetainedPasswordRevealKey({
      paramInfoId: rowId,
      sectionId,
    }),
  );
  const revealPending = revealAvailable && revealState?.pending === true;
  const revealedValue = getProjectGpuPasswordRevealedValue({
    revealAvailable,
    value: revealState?.value,
  });
  return {
    defaultDisplayValue: toProjectGpuParamDisplayValue(codeObjImpl.defaultVal),
    displayValue,
    hasSecret,
    kind: "password",
    placeholder: getProjectGpuPasswordPlaceholder({ displayValue, hasSecret }),
    renderOwner: "dom-owned",
    rendererFamily: controlKind,
    revealAvailable,
    revealPending,
    revealedValue,
    commitPolicy: "native-island",
  };
}

function getProjectGpuPasswordPlaceholder({
  displayValue,
  hasSecret,
}: {
  readonly displayValue: string;
  readonly hasSecret: boolean;
}): string {
  return hasSecret && displayValue === "" ? "Saved" : "";
}

function getProjectGpuPasswordRevealedValue({
  revealAvailable,
  value,
}: {
  readonly revealAvailable: boolean;
  readonly value: string | null | undefined;
}): string | null {
  if (!revealAvailable) {
    return null;
  }
  return value ?? null;
}

function getProjectGpuPasswordRevealAvailable({
  displayValue,
  hasSecret,
  isDeploymentMode,
}: {
  readonly displayValue: string;
  readonly hasSecret: boolean;
  readonly isDeploymentMode: boolean;
}): boolean {
  return (
    !isDeploymentMode &&
    shouldShowPasswordReveal({
      hasSecret,
      value: displayValue,
    })
  );
}
