import _ from "lodash";
import type { DropzoneStatelessAttachment } from "utils/dropzone";
import {
  CodeObjTypeEnum,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  type BinaryDependencyValue,
  type LiteralDependencyValue,
  type SectionParamDependencyKey,
} from "utils/generatedTypes";
import { shouldEmitRealtimeValue } from "utils/paramValue";
import type { ParamValueChangeOptions } from "./ParamUIs/ConfiguredParamInputs";

export type ParamInputBackendUpdateKind = "password" | "standard" | null;

type PlanParamInputChangeArgs = {
  previousValue: string;
  nextValue: string | number | boolean | null;
  codeObjType: CodeObjTypeEnum;
  options?: ParamValueChangeOptions;
};

type DropzoneAttachmentMetadata =
  | {
      kind: "file";
      name: string;
      mimeType: string;
      size: number;
      contentId: string;
      byteLength: number;
    }
  | {
      kind: "text";
      name: string;
      text: string;
    };

export type ParamInputChangePlan = {
  nextValue: string;
  shouldEmitRealtime: boolean;
  backendUpdateKind: ParamInputBackendUpdateKind;
};

export type ParamInputDependencyEvent = {
  dependencyKey: SectionParamDependencyKey;
  payload: LiteralDependencyValue | BinaryDependencyValue;
  binaryPayload?: ArrayBuffer;
};

export function planParamInputChange({
  previousValue,
  nextValue,
  codeObjType,
  options,
}: PlanParamInputChangeArgs): ParamInputChangePlan {
  const normalizedValue = _.toString(nextValue);

  return {
    nextValue: normalizedValue,
    shouldEmitRealtime: shouldEmitRealtimeValue({
      previousValue,
      nextValue: normalizedValue,
      codeObjType,
    }),
    backendUpdateKind: resolveParamInputBackendUpdateKind({
      codeObjType,
      options,
    }),
  };
}

export function shouldRevealPasswordValue({
  codeObjType,
  isRevealing,
  value,
}: {
  codeObjType: CodeObjTypeEnum;
  isRevealing: boolean;
  value: string;
}): boolean {
  return (
    codeObjType === CodeObjTypeEnum.PasswordParam &&
    !isRevealing &&
    value === ""
  );
}

export function buildDropzoneDependencyEvents({
  sectionId,
  paramInfoId,
  attachments,
}: {
  sectionId: string;
  paramInfoId: string;
  attachments: DropzoneStatelessAttachment[];
}): ParamInputDependencyEvent[] {
  if (attachments.length === 0) {
    return [];
  }

  const dependencyKey = createSectionParamDependencyKey(sectionId, paramInfoId);
  const events: ParamInputDependencyEvent[] = [
    {
      dependencyKey,
      payload: {
        payload: JSON.stringify({
          sectionId,
          paramInfoId,
          attachments: attachments.map(getDropzoneAttachmentMetadata),
        }),
        type: DependencyValueTypeEnum.Literal,
      },
    },
  ];

  for (const attachment of attachments) {
    if (attachment.kind !== "file") {
      continue;
    }
    events.push({
      dependencyKey,
      payload: {
        payload: {
          contentId: attachment.contentId,
          byteLength: attachment.byteLength,
          mimeType: attachment.mimeType,
        },
        type: DependencyValueTypeEnum.Binary,
      },
      binaryPayload: attachment.binaryPayload,
    });
  }

  return events;
}

function resolveParamInputBackendUpdateKind({
  codeObjType,
  options,
}: Pick<
  PlanParamInputChangeArgs,
  "codeObjType" | "options"
>): ParamInputBackendUpdateKind {
  if (options?.skipBackendUpdate) {
    return null;
  }

  return codeObjType === CodeObjTypeEnum.PasswordParam
    ? "password"
    : "standard";
}

function createSectionParamDependencyKey(
  sectionId: string,
  paramInfoId: string,
): SectionParamDependencyKey {
  return {
    type: DependencyKeyTypeEnum.SectionParam,
    sectionId,
    codeObjId: paramInfoId,
  };
}

function getDropzoneAttachmentMetadata(
  attachment: DropzoneStatelessAttachment,
): DropzoneAttachmentMetadata {
  if (attachment.kind === "file") {
    return {
      kind: attachment.kind,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      contentId: attachment.contentId,
      byteLength: attachment.byteLength,
    };
  }

  return attachment;
}
