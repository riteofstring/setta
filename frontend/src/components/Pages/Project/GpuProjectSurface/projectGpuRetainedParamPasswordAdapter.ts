import { callOpenAPI, res200 } from "@setta/app-subsystem-frontend-sdk";
import type { GpuRetainedContentInteractionHit } from "gpuFlow/interactions/retainedContentInteraction";
import { getPasswordParamValue } from "openapi/http";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import {
  getProjectGpuRetainedPasswordRevealKey,
  type ProjectGpuRetainedPasswordRevealStateMap,
  type ProjectGpuRetainedPasswordRevealUpdate,
} from "./projectGpuRetainedParamPasswordRevealState";

export function commitProjectGpuRetainedPasswordRevealClick(
  event: GpuRetainedContentInteractionHit,
  {
    onPasswordRevealStateChange,
    passwordRevealStates,
  }: {
    readonly onPasswordRevealStateChange: (
      update: ProjectGpuRetainedPasswordRevealUpdate,
    ) => void;
    readonly passwordRevealStates: ProjectGpuRetainedPasswordRevealStateMap;
  },
): boolean {
  if (!isProjectGpuRetainedPasswordRevealHit(event)) {
    return false;
  }
  const paramInfoId = event.hit.ownerRowId;
  const sectionId = event.ownerSectionId;
  const state = passwordRevealStates.get(
    getProjectGpuRetainedPasswordRevealKey({ paramInfoId, sectionId }),
  );
  if (state?.pending) {
    return true;
  }
  if (state?.value !== null && state?.value !== undefined) {
    onPasswordRevealStateChange({
      kind: "clear",
      paramInfoId,
      sectionId,
    });
    return true;
  }
  onPasswordRevealStateChange({
    kind: "pending",
    paramInfoId,
    sectionId,
  });
  void revealProjectGpuRetainedPasswordValue({
    paramInfoId,
    sectionId,
  })
    .then((value) => {
      onPasswordRevealStateChange(
        value === null
          ? {
              kind: "clear",
              paramInfoId,
              sectionId,
            }
          : {
              kind: "revealed",
              paramInfoId,
              sectionId,
              value,
            },
      );
    })
    .finally(() => {
      onPasswordRevealStateChange({
        kind: "settle",
        paramInfoId,
        sectionId,
      });
    });
  return true;
}

export function isProjectGpuRetainedPasswordRevealHit(
  event: GpuRetainedContentInteractionHit,
): boolean {
  if (
    event.hit.kind !== "control-subpart" ||
    event.hit.subpartKind !== "password-reveal"
  ) {
    return false;
  }
  const row = event.retainedScene.rows.find(
    (candidate) => candidate.id === event.hit.ownerRowId,
  );
  return Boolean(
    row &&
      !row.state.disabled &&
      row.control?.kind === "password" &&
      (row.control.revealAvailable || row.control.revealedValue !== null),
  );
}

async function revealProjectGpuRetainedPasswordValue({
  paramInfoId,
  sectionId,
}: {
  readonly paramInfoId: string;
  readonly sectionId: string;
}): Promise<string | null> {
  const response = await callOpenAPI(
    getPasswordParamValue({
      body: {
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        paramInfoId,
      },
    } as Parameters<typeof getPasswordParamValue>[0]),
  );
  if (!res200(response)) {
    return null;
  }
  if (
    !response.data ||
    typeof (response.data as { value?: unknown }).value !== "string"
  ) {
    throw new Error(
      `Invalid GPU retained password reveal response for ${paramInfoId} in section ${sectionId}.`,
    );
  }
  return response.data.value;
}
