import _ from "lodash";
import React from "react";
import { ensureAppProjectConfigLoaded } from "state/actions/appDeploymentState";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  sendRealtimeDependencyEvent,
  sendRealtimeSectionParamLiteral,
} from "state/actions/websocketRealtimeDispatch";
import { useLocalPendingValue } from "state/hooks/utils";
import { useAppConfigs } from "state/stores/appStores";
import { useServerMode } from "state/stores/sessionStores";
import type { DropzoneStatelessAttachment } from "utils/dropzone";
import { res200 } from "utils/endpointUtils";
import {
  route_get_password_param_value,
  route_set_param_entered_value,
} from "utils/generatedEndpoints";
import type {
  BaseChildlessCodeObjImplUnion,
  BaseSectionImplUnion,
  LiteralDependencyValue,
} from "utils/generatedTypes";
import {
  CodeObjTypeEnum,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
} from "utils/generatedTypes";
import { resolveParamBinding } from "./appBindings";
import { useAppConfigScope, useAppRuntime } from "./appContext";
import { AppParamUI } from "./appRegistryParamControls";
import {
  resolveAppBoundParamState,
  resolveAppParamEditState,
} from "./appRegistryParamModel";
import { type AppComponentProps, resolveConfigId } from "./appRegistryShared";

function ParamStatusBox({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2 text-[color:var(--app-muted)] [font-size:var(--app-text-xs)]">
      {message}
    </div>
  );
}

export function ParamInputBlock({ element }: AppComponentProps) {
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const scope = useAppConfigScope();
  const {
    configId: bindingConfigId,
    sectionId,
    paramId,
    label,
    description,
  } = resolveParamBinding(props, runtime?.dataBindings);
  const resolvedConfigId = resolveConfigId(
    bindingConfigId,
    runtime?.defaultConfigId ?? null,
    scope.configId,
  );
  const configState = useAppConfigs((state) =>
    resolvedConfigId ? state.configs[resolvedConfigId] : null,
  );
  const serverMode = useServerMode((state) => state.mode);
  const modeResolved = useServerMode((state) => state.modeResolved);
  const canEditParams = runtime?.canEditParams ?? true;

  React.useEffect(() => {
    if (
      !resolvedConfigId ||
      configState ||
      !modeResolved ||
      serverMode !== "app"
    ) {
      return;
    }
    void ensureAppProjectConfigLoaded(resolvedConfigId);
  }, [configState, modeResolved, resolvedConfigId, serverMode]);

  if (!resolvedConfigId) {
    return <ParamStatusBox message="Missing config scope." />;
  }

  if (!configState) {
    return <ParamStatusBox message="Loading config…" />;
  }

  if (!sectionId || !paramId) {
    return <ParamStatusBox message="Missing param binding." />;
  }

  const { canRenderParam, displayName, sectionImpl, codeObjImpl } =
    resolveAppBoundParamState(configState, sectionId, paramId);

  if (!canRenderParam || !sectionImpl || !codeObjImpl) {
    return <ParamStatusBox message="Missing param binding." />;
  }

  const { codeParamBlocked, effectiveCanEditParams } = resolveAppParamEditState(
    {
      canEditParams,
      modeResolved,
      serverMode,
      codeObjImpl,
    },
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold uppercase tracking-wide text-[color:var(--app-muted)] [font-size:var(--app-text-xs)]">
          {label ?? displayName ?? paramId}
        </span>
        {description ? (
          <span className="text-[11px] text-[color:var(--app-muted)]">
            {description}
          </span>
        ) : null}
      </div>
      <div className="rounded-md border border-[color:var(--app-input-border,_var(--app-border))] bg-[color:var(--app-input-bg,_var(--app-surface))] px-2 py-1">
        <div
          className={
            effectiveCanEditParams ? "" : "pointer-events-none opacity-60"
          }
        >
          <AppParamInput
            configId={resolvedConfigId}
            sectionId={sectionId}
            paramInfoId={paramId}
            codeObjImpl={codeObjImpl}
            sectionImpl={sectionImpl}
            baseValue={codeObjImpl.value}
            canEditParams={effectiveCanEditParams}
          />
        </div>
        {!canEditParams ? (
          <div className="mt-2 text-[11px] text-[color:var(--app-muted)]">
            Param edits are disabled by policy.
          </div>
        ) : null}
        {codeParamBlocked && canEditParams ? (
          <div className="mt-2 text-[11px] text-[color:var(--app-muted)]">
            Code params cannot be edited in app deployments. Bind a MetaControl
            param instead.
          </div>
        ) : null}
      </div>
    </div>
  );
}

type AppParamInputProps = {
  configId: string;
  sectionId: string;
  paramInfoId: string;
  baseValue: string | number | boolean | null;
  codeObjImpl: BaseChildlessCodeObjImplUnion;
  sectionImpl: BaseSectionImplUnion;
  canEditParams: boolean;
};

function AppParamInput({
  configId,
  sectionId,
  paramInfoId,
  baseValue,
  codeObjImpl,
  sectionImpl,
  canEditParams,
}: AppParamInputProps) {
  const isPasswordParam = codeObjImpl.type === CodeObjTypeEnum.PasswordParam;
  const [value, setPendingValue] = useLocalPendingValue(baseValue);
  const [isRevealing, setIsRevealing] = React.useState(false);

  function onChange(
    nextValue: string | number | boolean | null,
    options?: { skipBackendUpdate?: boolean },
  ) {
    const nextValueStr = _.toString(nextValue);
    setPendingValue(nextValueStr);
    sendRealtimeSectionParamLiteral(
      sectionId,
      paramInfoId,
      nextValueStr,
      configId,
    );
    if (options?.skipBackendUpdate) {
      return;
    }
    if (isPasswordParam) {
      debouncedSetPasswordParamValue(
        configId,
        sectionId,
        paramInfoId,
        nextValueStr,
      );
      return;
    }
    debouncedSetParamEnteredValue(
      configId,
      sectionId,
      paramInfoId,
      nextValueStr,
    );
  }

  function onRevealPassword() {
    if (!isPasswordParam || isRevealing || value !== "") {
      return;
    }
    setIsRevealing(true);
    route_get_password_param_value({
      projectConfigId: configId,
      sectionId,
      paramInfoId,
    })
      .then((response) => {
        if (res200(response)) {
          setPendingValue(response.data.value);
        }
      })
      .finally(() => {
        setIsRevealing(false);
      });
  }

  function onDropzoneStateless(attachments: DropzoneStatelessAttachment[]) {
    if (attachments.length === 0) {
      return;
    }

    const dependencyKey = {
      type: DependencyKeyTypeEnum.SectionParam,
      sectionId,
      codeObjId: paramInfoId,
    };
    const metadataAttachments = attachments.map((attachment) => {
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
    });
    const metadataPayload: LiteralDependencyValue = {
      payload: JSON.stringify({
        sectionId,
        paramInfoId,
        attachments: metadataAttachments,
      }),
      type: DependencyValueTypeEnum.Literal,
    };

    sendRealtimeDependencyEvent(
      {
        dependencyKey,
        payload: metadataPayload,
      },
      configId,
    );

    for (const attachment of attachments) {
      if (attachment.kind !== "file") {
        continue;
      }
      sendRealtimeDependencyEvent(
        {
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
        },
        configId,
      );
    }
  }

  return (
    <AppParamUI
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={onChange}
      onDropzoneStateless={onDropzoneStateless}
      onRevealPassword={onRevealPassword}
      isPasswordRevealPending={isRevealing}
      codeObjImpl={codeObjImpl}
      sectionImpl={sectionImpl}
      canEditParams={canEditParams}
    />
  );
}

const notifyParamUpdateError = _.throttle(
  (message: string) => {
    addTemporaryNotification(message);
  },
  2500,
  { trailing: false },
);

function createDebouncedParamUpdater() {
  return _.debounce(
    (
      configId: string,
      sectionId: string,
      paramInfoId: string,
      value: string,
    ) => {
      route_set_param_entered_value({
        projectConfigId: configId,
        sectionId,
        paramInfoId,
        value,
      }).then((response) => {
        if (res200(response)) {
          return;
        }
        notifyParamUpdateError(
          response.status === 403
            ? "This parameter cannot be edited in app deployments."
            : "Failed to update parameter.",
        );
      });
    },
    50,
  );
}

const debouncedSetParamEnteredValue = createDebouncedParamUpdater();
const debouncedSetPasswordParamValue = createDebouncedParamUpdater();
