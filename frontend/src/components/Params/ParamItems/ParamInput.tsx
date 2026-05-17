import type { DropzoneStatelessAttachment } from "@setta/app-subsystem-frontend-sdk";
import { callOpenAPI, res200 } from "@setta/app-subsystem-frontend-sdk";
import _ from "lodash";
import { getPasswordParamValue } from "openapi/http";
import React from "react";
import {
  getCurrProjectConfigId,
  setCodeObjVariantImplValue,
} from "state/actions/sectionInfos";
import { sendRealtimeDependencyEvent } from "state/actions/websocketReceive";
import { useProjectState, useToolArgumentPreview } from "state/definitions";
import { useLocalPendingValue } from "state/hooks/utils";
import {
  BaseChildlessCodeObjImplUnion,
  BinaryDependencyValue,
  CodeObjTypeEnum,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  LiteralDependencyValue,
} from "utils/generatedTypes";
import type { ParamValueChangeOptions } from "../ParamUIs/ConfiguredParamInputs";
import {
  ParamUI,
  type ParamUITextInputInitialActivationEvent,
} from "../ParamUIs/ParamUI";
import {
  commitParamInputValueChange,
  flushPendingParamInputValueChange,
  getParamInputPreviewState,
  type ParamInputPreviewState,
} from "./paramValueUpdates";

type ParamInputProps = {
  sectionId: string;
  paramInfoId: string;
  focusActiveSectionOnTextInput?: boolean;
  maybeErrorMessage?: string;
  textInputInitialActivationEvent?:
    | ParamUITextInputInitialActivationEvent
    | null
    | undefined;
  tooltipParentDivId?: string | null | undefined;
};

type StatelessDependencyEvent =
  | {
      payload: LiteralDependencyValue;
    }
  | {
      binaryPayload: ArrayBuffer;
      payload: BinaryDependencyValue;
    };

const DEFAULT_PREVIEW_PARAM_STATE: ParamInputPreviewState = {
  baseValue: "",
  codeObjType: CodeObjTypeEnum.TextParam,
  codeObjVariantId: null,
  sectionVariantId: null,
};

function usePreviewParamState(
  sectionId: string,
  paramInfoId: string,
): ParamInputPreviewState | null {
  return useProjectState(
    (state) => getParamInputPreviewState(state, sectionId, paramInfoId),
    _.isEqual,
  );
}

function usePreviewValue(
  projectConfigId: string,
  sectionId: string,
  paramInfoId: string,
) {
  return useToolArgumentPreview((state) => {
    const previewState = state.byProjectConfigId[projectConfigId];
    if (!previewState) {
      return null;
    }

    const sectionEntries =
      previewState.previewParamValueBySectionAndParamId[sectionId];
    if (!sectionEntries) {
      return null;
    }

    const entry = sectionEntries[paramInfoId];
    return entry ? entry.value : null;
  });
}

function syncLocalPreviewParamValue({
  canSyncPreviewValue,
  codeObjVariantId,
  paramInfoId,
  pendingValue,
}: {
  canSyncPreviewValue: boolean;
  codeObjVariantId: string | null;
  paramInfoId: string;
  pendingValue: string;
}) {
  if (!canSyncPreviewValue || !codeObjVariantId) {
    return;
  }

  useProjectState.setState((state) => {
    setCodeObjVariantImplValue<BaseChildlessCodeObjImplUnion>(
      state,
      paramInfoId,
      codeObjVariantId,
      {
        value: pendingValue,
      },
    );
  });
}

function toStatelessAttachmentMetadata(
  attachment: DropzoneStatelessAttachment,
): Omit<DropzoneStatelessAttachment, "binaryPayload"> {
  if (attachment.kind !== "file") {
    return attachment;
  }
  return {
    kind: attachment.kind,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    contentId: attachment.contentId,
    byteLength: attachment.byteLength,
  };
}

function buildStatelessDependencyEvents({
  attachments,
  paramInfoId,
  sectionId,
}: {
  attachments: DropzoneStatelessAttachment[];
  paramInfoId: string;
  sectionId: string;
}) {
  const dependencyKey = {
    type: DependencyKeyTypeEnum.SectionParam,
    sectionId,
    codeObjId: paramInfoId,
  };
  const events: StatelessDependencyEvent[] = [
    {
      payload: {
        payload: JSON.stringify({
          sectionId,
          paramInfoId,
          attachments: attachments.map(toStatelessAttachmentMetadata),
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
      binaryPayload: attachment.binaryPayload,
      payload: {
        payload: {
          contentId: attachment.contentId,
          byteLength: attachment.byteLength,
          mimeType: attachment.mimeType,
        },
        type: DependencyValueTypeEnum.Binary,
      },
    });
  }

  return { dependencyKey, events };
}

function publishStatelessAttachments({
  attachments,
  paramInfoId,
  sectionId,
}: {
  attachments: DropzoneStatelessAttachment[];
  paramInfoId: string;
  sectionId: string;
}) {
  const { dependencyKey, events } = buildStatelessDependencyEvents({
    attachments,
    paramInfoId,
    sectionId,
  });

  for (const event of events) {
    sendRealtimeDependencyEvent({
      dependencyKey,
      ...event,
    });
  }
}

async function revealPasswordValue({
  paramInfoId,
  sectionId,
}: Pick<ParamInputProps, "paramInfoId" | "sectionId">) {
  const response = await callOpenAPI(
    getPasswordParamValue({
      body: {
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        paramInfoId,
      },
    } as Parameters<typeof getPasswordParamValue>[0]),
  );
  return res200(response) ? response.data.value : null;
}

function _ParamInput({
  sectionId,
  paramInfoId,
  focusActiveSectionOnTextInput,
  maybeErrorMessage,
  textInputInitialActivationEvent,
  tooltipParentDivId,
}: ParamInputProps) {
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const previewParamState = usePreviewParamState(sectionId, paramInfoId);
  const hasPreviewParamState = previewParamState !== null;
  const { baseValue, codeObjType, codeObjVariantId } =
    previewParamState ?? DEFAULT_PREVIEW_PARAM_STATE;
  const isPasswordParam = codeObjType === CodeObjTypeEnum.PasswordParam;
  const previewValue = usePreviewValue(projectConfigId, sectionId, paramInfoId);
  const globalValue = previewValue ?? baseValue;
  const canSyncPreviewValue =
    hasPreviewParamState && !isPasswordParam && codeObjVariantId !== null;
  const [value, setPendingValue] = useLocalPendingValue(
    globalValue,
    (pendingValue) => {
      syncLocalPreviewParamValue({
        canSyncPreviewValue,
        codeObjVariantId,
        paramInfoId,
        pendingValue,
      });
    },
    codeObjVariantId,
  );
  const [isRevealing, setIsRevealing] = React.useState(false);
  // value and enteredValue should always be string
  function onChange(v, options?: ParamValueChangeOptions) {
    if (!hasPreviewParamState) {
      return;
    }
    const nextValue = commitParamInputValueChange({
      nextValue: v,
      options,
      paramInfoId,
      previousValue: value,
      previewState: previewParamState,
      sectionId,
    });
    setPendingValue(nextValue);
  }
  function onTextInputBlur() {
    if (!hasPreviewParamState || isPasswordParam) {
      return;
    }
    flushPendingParamInputValueChange({
      codeObjVariantId,
      paramInfoId,
      projectConfigId,
      sectionId,
      sectionVariantId: previewParamState.sectionVariantId,
    });
  }
  function onRevealPassword() {
    if (!hasPreviewParamState || !isPasswordParam || isRevealing || value) {
      return;
    }
    setIsRevealing(true);
    void revealPasswordValue({ paramInfoId, sectionId })
      .then((nextValue) => {
        if (nextValue !== null) {
          setPendingValue(nextValue);
        }
      })
      .finally(() => {
        setIsRevealing(false);
      });
  }
  function onDropzoneStateless(attachments: DropzoneStatelessAttachment[]) {
    if (!hasPreviewParamState || attachments.length === 0) {
      return;
    }
    publishStatelessAttachments({
      attachments,
      paramInfoId,
      sectionId,
    });
  }
  if (!hasPreviewParamState) {
    return null;
  }
  return (
    <ParamUI
      key={codeObjVariantId}
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={onChange}
      onTextInputBlur={onTextInputBlur}
      onDropzoneStateless={onDropzoneStateless}
      onRevealPassword={onRevealPassword}
      isPasswordRevealPending={isRevealing}
      focusActiveSectionOnTextInput={focusActiveSectionOnTextInput}
      textInputInitialActivationEvent={textInputInitialActivationEvent}
      maybeErrorMessage={maybeErrorMessage}
      tooltipParentDivId={tooltipParentDivId}
    />
  );
}
export const ParamInput = React.memo(_ParamInput);
