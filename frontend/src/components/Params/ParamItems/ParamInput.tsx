import _ from "lodash";
import { getPasswordParamValue, setParamEnteredValue } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import React from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrCodeObjVariantIfPresent,
  getCurrEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrProjectConfigId,
  getCurrSectionVariantId,
  setCodeObjVariantImplValue,
} from "state/actions/sectionInfos";
import {
  sendRealtimeDependencyEvent,
  sendRealtimeSectionParamLiteral,
} from "state/actions/websocketReceive";
import { useProjectState, useToolArgumentPreview } from "state/definitions";
import { useLocalPendingValue } from "state/hooks/utils";
import type { DropzoneStatelessAttachment } from "utils/dropzone";
import { res200 } from "utils/endpointUtils";
import {
  BaseChildlessCodeObjImplUnion,
  BinaryDependencyValue,
  CodeObjTypeEnum,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  LiteralDependencyValue,
  isBaseChildlessCodeObjImpl,
} from "utils/generatedTypes";
import { shouldEmitRealtimeValue } from "utils/paramValue";
import type { ParamValueChangeOptions } from "../ParamUIs/ConfiguredParamInputs";
import { ParamUI } from "../ParamUIs/ParamUI";

type ParamInputProps = {
  sectionId: string;
  paramInfoId: string;
  maybeErrorMessage?: string;
};

type PreviewParamState = {
  baseValue: string;
  codeObjType: CodeObjTypeEnum;
  codeObjVariantId: string | null;
  sectionVariantId: string | null;
};

type ParamBackendUpdate =
  | {
      kind: "password";
      sectionVariantId: string;
    }
  | {
      kind: "standard";
      codeObjVariantId: string;
      sectionVariantId: string;
    };

type StatelessDependencyEvent =
  | {
      payload: LiteralDependencyValue;
    }
  | {
      binaryPayload: ArrayBuffer;
      payload: BinaryDependencyValue;
    };

const DEFAULT_PREVIEW_PARAM_STATE: PreviewParamState = {
  baseValue: "",
  codeObjType: CodeObjTypeEnum.TextParam,
  codeObjVariantId: null,
  sectionVariantId: null,
};

function usePreviewParamState(
  sectionId: string,
  paramInfoId: string,
): PreviewParamState | null {
  return useProjectState((state) => {
    const impl = getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
      state,
      sectionId,
      paramInfoId,
      isBaseChildlessCodeObjImpl,
      true,
    );
    if (!impl) {
      return null;
    }

    const codeObjVariant = getCurrCodeObjVariantIfPresent(
      state,
      sectionId,
      paramInfoId,
      true,
    );
    if (!codeObjVariant) {
      return null;
    }

    return {
      baseValue: impl.value,
      codeObjType: impl.type,
      codeObjVariantId: codeObjVariant.id,
      sectionVariantId: getCurrSectionVariantId(state, sectionId, true),
    };
  }, _.isEqual);
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

function resolveBackendUpdate({
  codeObjVariantId,
  isPasswordParam,
  sectionVariantId,
}: {
  codeObjVariantId: string | null;
  isPasswordParam: boolean;
  sectionVariantId: string | null;
}): ParamBackendUpdate | null {
  if (!sectionVariantId) {
    return null;
  }
  if (isPasswordParam) {
    return {
      kind: "password",
      sectionVariantId,
    };
  }
  if (!codeObjVariantId) {
    return null;
  }
  return {
    kind: "standard",
    codeObjVariantId,
    sectionVariantId,
  };
}

function queueBackendParamUpdate({
  nextValue,
  paramInfoId,
  sectionId,
  update,
}: {
  nextValue: string;
  paramInfoId: string;
  sectionId: string;
  update: ParamBackendUpdate | null;
}) {
  if (!update) {
    return;
  }
  if (update.kind === "password") {
    debouncedSetPasswordParamValue(
      sectionId,
      update.sectionVariantId,
      paramInfoId,
      nextValue,
    );
    return;
  }
  debouncedSetParamEnteredValue(
    sectionId,
    update.sectionVariantId,
    paramInfoId,
    update.codeObjVariantId,
    nextValue,
  );
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
  maybeErrorMessage,
}: ParamInputProps) {
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const previewParamState = usePreviewParamState(sectionId, paramInfoId);
  const hasPreviewParamState = previewParamState !== null;
  const { baseValue, codeObjType, codeObjVariantId, sectionVariantId } =
    previewParamState ?? DEFAULT_PREVIEW_PARAM_STATE;
  const isPasswordParam = codeObjType === CodeObjTypeEnum.PasswordParam;
  const previewValue = usePreviewValue(projectConfigId, sectionId, paramInfoId);
  const globalValue = previewValue ?? baseValue;
  const canSyncPreviewValue =
    hasPreviewParamState && !isPasswordParam && codeObjVariantId !== null;
  const backendUpdate = resolveBackendUpdate({
    codeObjVariantId,
    isPasswordParam,
    sectionVariantId,
  });
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
    const vStr = _.toString(v);
    setPendingValue(vStr);
    if (
      shouldEmitRealtimeValue({
        previousValue: value,
        nextValue: vStr,
        codeObjType,
      })
    ) {
      sendRealtimeSectionParamLiteral(sectionId, paramInfoId, vStr);
    }
    if (options?.skipBackendUpdate) {
      return;
    }
    queueBackendParamUpdate({
      nextValue: vStr,
      paramInfoId,
      sectionId,
      update: backendUpdate,
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
      onDropzoneStateless={onDropzoneStateless}
      onRevealPassword={onRevealPassword}
      isPasswordRevealPending={isRevealing}
      maybeErrorMessage={maybeErrorMessage}
    />
  );
}
const debouncedSetParamEnteredValue = _.debounce(
  (sectionId, sectionVariantId, paramInfoId, codeObjVariantId, value) => {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCodeObjVariantImplValue<BaseChildlessCodeObjImplUnion>(
          state,
          paramInfoId,
          codeObjVariantId,
          {
            value,
          },
        );
      },
      send: (frontendOpId) =>
        callOpenAPI(
          setParamEnteredValue({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              sectionVariantId,
              paramInfoId,
              value,
              frontendOpId,
            },
          } as Parameters<typeof setParamEnteredValue>[0]),
        ),
    });
  },
  50,
);
const debouncedSetPasswordParamValue = _.debounce(
  (sectionId, sectionVariantId, paramInfoId, value) => {
    callOpenAPI(
      setParamEnteredValue({
        body: {
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          sectionVariantId,
          paramInfoId,
          value,
        },
      } as Parameters<typeof setParamEnteredValue>[0]),
    );
  },
  50,
);
export const ParamInput = React.memo(_ParamInput);
