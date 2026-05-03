import {
  callOpenAPI,
  getErrorDetail,
  parseDropzoneValue,
  res200,
  serializeDropzoneValue,
  type DropzoneStoredAttachment,
} from "@setta/app-subsystem-frontend-sdk";
import type { GpuRetainedContentInteractionHit } from "gpuFlow/interactions/retainedContentInteraction";
import type { GpuRetainedContentRow } from "gpuFlow/retainedContentScene";
import { deleteArtifacts, setParamEnteredValue } from "openapi/http";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  dispatchOptimisticProjectStateUpdateWithResult,
  getCurrEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrProjectConfigId,
  getCurrSectionVariantId,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  ArtifactTypeEnum,
  CodeObjTypeEnum,
  DropzoneModeEnum,
  NotificationTypeEnum,
  isBaseParamCodeObjImpl,
  type DropzoneParamCodeObjImpl,
} from "utils/generatedTypes";

export function commitProjectGpuRetainedDropzoneAttachmentDelete(
  event: GpuRetainedContentInteractionHit,
): boolean {
  if (!isProjectGpuRetainedDropzoneAttachmentDeleteHit(event)) {
    return false;
  }
  const attachmentId = event.hit.attachmentId;
  if (!attachmentId) {
    throw new Error(
      `Missing GPU retained dropzone attachment id for ${event.hit.ownerRowId} in section ${event.ownerSectionId}.`,
    );
  }
  const projectState = useProjectState.getState();
  const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
    projectState,
    event.ownerSectionId,
    event.hit.ownerRowId,
    isBaseParamCodeObjImpl,
  );
  if (!codeObjImpl || codeObjImpl.type !== CodeObjTypeEnum.DropzoneParam) {
    throw new Error(
      `Missing GPU retained dropzone param ${event.hit.ownerRowId} in section ${event.ownerSectionId}.`,
    );
  }
  if (codeObjImpl.mode === DropzoneModeEnum.STATELESS) {
    return false;
  }
  const parsedValue = parseDropzoneValue(codeObjImpl.value);
  if (!parsedValue) {
    throw new Error(
      `Invalid GPU retained dropzone value for ${event.hit.ownerRowId} in section ${event.ownerSectionId}.`,
    );
  }
  const attachment = parsedValue.attachments.find(
    (candidate) => candidate.id === attachmentId,
  );
  if (!attachment) {
    throw new Error(
      `Missing GPU retained dropzone attachment ${attachmentId} for ${event.hit.ownerRowId} in section ${event.ownerSectionId}.`,
    );
  }
  commitProjectGpuRetainedDropzoneValueDelete({
    attachment,
    nextValue: serializeDropzoneValue(
      parsedValue.attachments.filter(
        (candidate) => candidate.id !== attachmentId,
      ),
    ),
    paramInfoId: event.hit.ownerRowId,
    previousValue: codeObjImpl.value,
    sectionId: event.ownerSectionId,
  });
  return true;
}

export function isProjectGpuRetainedDropzoneAttachmentDeleteHit(
  event: GpuRetainedContentInteractionHit,
): boolean {
  if (
    event.hit.kind !== "control-subpart" ||
    event.hit.subpartKind !== "dropzone-attachment-delete"
  ) {
    return false;
  }
  const row = getProjectGpuRetainedDropzoneHitRow(event);
  return Boolean(
    row &&
      !row.state.disabled &&
      row.control?.kind === "dropzone" &&
      event.hit.attachmentId,
  );
}

function commitProjectGpuRetainedDropzoneValueDelete({
  attachment,
  nextValue,
  paramInfoId,
  previousValue,
  sectionId,
}: {
  readonly attachment: DropzoneStoredAttachment;
  readonly nextValue: string;
  readonly paramInfoId: string;
  readonly previousValue: string;
  readonly sectionId: string;
}) {
  const projectState = useProjectState.getState();
  const projectConfigId = getCurrProjectConfigId();
  const sectionVariantId = getCurrSectionVariantId(
    projectState,
    sectionId,
    true,
  );
  const { result } = dispatchOptimisticProjectStateUpdateWithResult({
    apply: (state) => {
      setCurrEffectiveCodeObjImplValue<DropzoneParamCodeObjImpl>(
        state,
        sectionId,
        paramInfoId,
        { value: nextValue },
      );
    },
    rollback: (state) => {
      setCurrEffectiveCodeObjImplValue<DropzoneParamCodeObjImpl>(
        state,
        sectionId,
        paramInfoId,
        { value: previousValue },
      );
    },
    send: (frontendOpId) =>
      callOpenAPI(
        setParamEnteredValue({
          body: {
            frontendOpId,
            paramInfoId,
            projectConfigId,
            sectionId,
            sectionVariantId,
            value: nextValue,
          },
        } as Parameters<typeof setParamEnteredValue>[0]),
      ),
  });
  void result
    .then((res) => {
      if (!res200(res)) {
        const detail = getErrorDetail(res.data);
        addTemporaryNotification(
          detail ?? "Failed to update attachments.",
          NotificationTypeEnum.warning,
        );
        return;
      }
      if (attachment.kind === "file") {
        void deleteProjectGpuRetainedDropzoneFileAttachment(attachment.id);
      }
    })
    .catch(() => {
      addTemporaryNotification(
        "Failed to update attachments.",
        NotificationTypeEnum.warning,
      );
    });
}

async function deleteProjectGpuRetainedDropzoneFileAttachment(
  artifactId: string,
) {
  const res = await callOpenAPI(
    deleteArtifacts({
      body: {
        artifacts: [
          {
            id: artifactId,
            type: ArtifactTypeEnum.File,
          },
        ],
      },
    } as Parameters<typeof deleteArtifacts>[0]),
  );
  if (res200(res)) {
    return;
  }
  const detail = getErrorDetail(res.data);
  addTemporaryNotification(
    detail ?? "Failed to delete attachment.",
    NotificationTypeEnum.warning,
  );
}

function getProjectGpuRetainedDropzoneHitRow(
  event: GpuRetainedContentInteractionHit,
): GpuRetainedContentRow | undefined {
  return event.retainedScene.rows.find(
    (candidate) => candidate.id === event.hit.ownerRowId,
  );
}
