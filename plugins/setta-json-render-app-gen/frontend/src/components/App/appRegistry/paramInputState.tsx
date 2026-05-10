import type { Action, UIElement } from "@json-render/core";

import type { ComponentRegistry } from "@json-render/react";

import {
  buildTextBlockTypographyScale,
  CODEMIRROR_TOOLTIP_PARENT_ID,
  type AppSubsystemFrontendHost,
  type BaseChildlessCodeObjImplUnion,
  type BaseSectionImplUnion,
  callOpenAPI,
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateDisplayFormatEnum,
  DateSelectionModeEnum,
  type DateParamCodeObjImpl,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  DropzoneModeEnum,
  getCurrentEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrentEffectiveSectionImpl,
  getCurrentSectionVariantId,
  getPasswordParamValue,
  getParamDisplayNameIfPresent,
  isBaseChildlessCodeObjImpl,
  isBaseSectionWithParamsImpl,
  type LiteralDependencyValue,
  NO_PAN_CLASS_NAME,
  type ObjectValues,
  res200,
  SectionTypeEnum,
  SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  setParamEnteredValue,
  shouldShowPasswordReveal,
  TextBlockFormatEnum,
  TextParamInputUITypeEnum,
  TimeControlModeEnum,
  TimeDisplayFontEnum,
  TimeDisplayFormatEnum,
  type TimeParamCodeObjImpl,
  type DropzoneStatelessAttachment,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";

import _ from "lodash";

import React from "react";

import ReactMarkdown from "react-markdown";

import rehypeKatex from "rehype-katex";

import remarkGfm from "remark-gfm";

import remarkMath from "remark-math";

import {
  useAppSubsystemFrontendHost,
  useAppSubsystemServerModeState,
} from "../../../appSubsystemFrontendHostContext";

import {
  useAppConfigs,
  type AppConfigState,
} from "../../../appSubsystemProjectState";

import { useDecodedAppImageById } from "../../../appSubsystemImageArtifacts";

import { useLocalPendingValue } from "../../../appSubsystemPendingValue";

import { ensureAppProjectConfigLoaded } from "../../../state/actions/app";

import {
  resolveActionBinding,
  resolveActionType,
  resolveImageOutputBinding,
  resolveParamBinding,
  resolveTextOutputBinding,
} from "../appBindings";

import type { AppThemeHeadingSizes } from "../appTheme";

import {
  AppConfigScopeContext,
  useAppActionState,
  useAppConfigScope,
  useAppRuntime,
} from "../appContext";

import { resolveResponsiveValue, useAppBreakpoint } from "../appResponsive";

import {
  CodeBlock,
  ColorPickerInput,
  DropdownInput,
  DropzoneInput,
  PasswordInput,
  RotaryInput,
  SliderInput,
  TextInputCodeMirror,
  TextParamDateTimeInput,
} from "../../ui/AppRuntimeControls";

import { SwitchInput } from "../../ui/SwitchInput";

import {
  ALIGN_CLASS,
  ActionButtonKind,
  AppComponentProps,
  AppSubsystemNotify,
  BOX_BACKGROUND_BY_ROLE,
  CardHeader,
  CodeObjTypeValue,
  ConfigLanguageValue,
  HEADING_KEY_BY_LEVEL,
  HEADING_SIZE_CLASS_BY_LEVEL,
  HeadingLevel,
  JUSTIFY_CLASS,
  NumberishStyleKey,
  RawElementProps,
  ResolvedActionButtonState,
  ResolvedParamBindingState,
  ResolvedParamInputBindingResult,
  ResolvedTabDefinition,
  TabChildElement,
  assignNumberishStyle,
  buildActionParams,
  buildCardStyle,
  buildTypographyStyle,
  getParamBindingFailureState,
  handleActionButtonClick,
  hasValidParamCodeObjBinding,
  renderAppBindingMessage,
  resolveActionButtonAvailability,
  resolveActionButtonClassName,
  resolveActionButtonKind,
  resolveActionButtonPresentation,
  resolveActionButtonRuntimeContext,
  resolveActionButtonState,
  resolveCodeObjVariantIdForParam,
  resolveCodeParamBlocked,
  resolveConfigId,
  resolveElementProps,
  resolveGapValue,
  resolveHeadingPresentation,
  resolveHeadingTheme,
  resolveMotionSettings,
  resolveNullableStringProp,
  resolveNumberish,
  resolveParamBindingState,
  resolveParamEditabilityMessage,
  resolveParamInputBindingResult,
  resolveParamInputLabel,
  resolveParamInputRuntimeContext,
  resolveParamInputStatusMessage,
  resolveResponsiveNumberish,
  resolveStringProp,
  resolveTabDefinition,
  resolveTabKey,
  resolveTabTitle,
  useAppConfigLoadState,
} from "./paramPresentation";

import {
  Box,
  Card,
  ConfigScope,
  Container,
  Grid,
  Heading,
  ParamInputBlock,
  ParamInputBlockContent,
  ParamInputBlockContentProps,
  ResolvedParamInputBlockState,
  Spacer,
  Stack,
  Tab,
  Tabs,
  Text,
  hasNonEmptyChildrenMetadata,
  resolveHeadingLevel,
  resolveParamInputBlockState,
} from "./layoutElements";

import {
  APP_PARAM_RENDERERS,
  AppParamUI,
  debouncedSetParamEnteredValue,
  debouncedSetPasswordParamValue,
  notifyParamUpdateError,
  renderCodeMirrorParam,
  renderColorPickerParam,
  renderDateParam,
  renderDropdownParam,
  renderDropzoneParam,
  renderPasswordParam,
  renderRotaryParam,
  renderSliderParam,
  renderSwitchParam,
  renderTimeParam,
  throttledParamUpdateErrorByNotify,
} from "./paramRenderers";

import {
  ActionButton,
  Divider,
  ImageOutput,
  MOTION_PRESETS,
  Motion,
  Stagger,
  TextOutput,
  TextOutputContent,
  appRegistry,
  resolveEasing,
  resolveMotionPreset,
  resolveNumber,
  resolveTextOutputData,
  resolveTextOutputRuntimeContext,
} from "./actionsAndRegistry";

export type AppParamInputProps = {
  configId: string;
  sectionId: string;
  paramInfoId: string;
  baseValue: string | number | boolean | null;
  codeObjImpl: BaseChildlessCodeObjImplUnion;
  sectionImpl: BaseSectionImplUnion;
  canEditParams: boolean;
};

export function AppParamInput({
  configId,
  sectionId,
  paramInfoId,
  baseValue,
  codeObjImpl,
  sectionImpl,
  canEditParams,
}: AppParamInputProps) {
  const frontendHost = useAppSubsystemFrontendHost();
  const isPasswordParam = codeObjImpl.type === CodeObjTypeEnum.PasswordParam;
  const sectionVariantId = useAppConfigs((state) => {
    const configState = state.configs[configId];
    if (!configState) {
      return null;
    }
    return getCurrentSectionVariantId(configState, sectionId);
  });
  const [value, setPendingValue] = useLocalPendingValue(
    baseValue,
    undefined,
    `${sectionVariantId ?? ""}:${paramInfoId}`,
  );
  const [isRevealing, setIsRevealing] = React.useState(false);
  function onChange(
    nextValue: boolean | number | string | null,
    options?: {
      skipBackendUpdate?: boolean;
    },
  ) {
    if (!sectionVariantId) {
      return;
    }
    const nextValueStr = _.toString(nextValue);
    setPendingValue(nextValueStr);
    frontendHost.emitRealtimeSectionParamLiteral(
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
        sectionVariantId,
        paramInfoId,
        nextValueStr,
        frontendHost.notify,
      );
      return;
    }
    debouncedSetParamEnteredValue(
      configId,
      sectionId,
      sectionVariantId,
      paramInfoId,
      nextValueStr,
      frontendHost.notify,
    );
  }
  function onRevealPassword() {
    if (!isPasswordParam || isRevealing || value !== "") {
      return;
    }
    setIsRevealing(true);
    callOpenAPI(
      getPasswordParamValue({
        body: {
          projectConfigId: configId,
          sectionId,
          paramInfoId,
        },
      } as Parameters<typeof getPasswordParamValue>[0]),
    )
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
    frontendHost.emitRealtimeDependencyEvent(
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
      frontendHost.emitRealtimeDependencyEvent(
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
      configId={configId}
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

export type AppParamUIProps = {
  configId: string;
  sectionId: string;
  paramInfoId: string;
  value: string | number | boolean | null;
  onChange: (
    value: string | number | boolean | null,
    options?: {
      skipBackendUpdate?: boolean;
    },
  ) => void;
  onDropzoneStateless?: (attachments: DropzoneStatelessAttachment[]) => void;
  onRevealPassword?: () => void;
  isPasswordRevealPending?: boolean;
  codeObjImpl: BaseChildlessCodeObjImplUnion;
  sectionImpl: BaseSectionImplUnion;
  canEditParams: boolean;
};

export const APP_PARAM_BORDER_CLASS =
  "section-value grid-row-start-1 border-box self-end border-b border-[color:var(--app-border)] peer-focus-within/textinput:border-[color:var(--app-accent)]";

export const APP_PARAM_TEXT_INPUT_CLASS =
  "nodrag peer/textinput flex min-w-0 flex-1 self-center font-mono [font-size:var(--app-text-xs)] text-[color:var(--app-text)]";

export const APP_PARAM_TEXT_INPUT_ACTIVE_CLASS = "cursor-text select-text";

export type AppParamRenderContext = {
  codeObjImpl: BaseChildlessCodeObjImplUnion;
  configLanguage: ConfigLanguageValue;
  configId: string;
  defaultVal: string | number | boolean | null;
  isDisabled: boolean;
  isPasswordRevealPending: boolean;
  onChange: AppParamUIProps["onChange"];
  onDropzoneStateless: AppParamUIProps["onDropzoneStateless"] | undefined;
  onEscape: () => void;
  onRevealPassword: AppParamUIProps["onRevealPassword"] | undefined;
  paramInfoId: string;
  passwordPlaceholder: string | undefined;
  sectionId: string;
  showPasswordReveal: boolean;
  stringValue: string;
  value: string | number | boolean | null;
};

export function noopAppParamEscape() {}

export function expectDateParamImpl(
  codeObjImpl: BaseChildlessCodeObjImplUnion,
): DateParamCodeObjImpl {
  if (codeObjImpl.type !== CodeObjTypeEnum.DateParam) {
    throw new TypeError(
      `Expected DateParam impl, got ${codeObjImpl.type ?? "unknown"}.`,
    );
  }
  return codeObjImpl as DateParamCodeObjImpl;
}

export function expectTimeParamImpl(
  codeObjImpl: BaseChildlessCodeObjImplUnion,
): TimeParamCodeObjImpl {
  if (codeObjImpl.type !== CodeObjTypeEnum.TimeParam) {
    throw new TypeError(
      `Expected TimeParam impl, got ${codeObjImpl.type ?? "unknown"}.`,
    );
  }
  return codeObjImpl as TimeParamCodeObjImpl;
}

export function resolveParamConfigLanguage(
  sectionImpl: BaseSectionImplUnion,
): ConfigLanguageValue {
  if (!isBaseSectionWithParamsImpl(sectionImpl)) {
    return ConfigLanguageEnum.python;
  }
  return sectionImpl.configLanguage === ConfigLanguageEnum.json
    ? ConfigLanguageEnum.json
    : ConfigLanguageEnum.python;
}

export function resolveParamDefaultValue(
  codeObjImpl: BaseChildlessCodeObjImplUnion,
): string | number | boolean | null {
  return "defaultVal" in codeObjImpl ? codeObjImpl.defaultVal : null;
}

export function isParamSectionFrozen(
  sectionImpl: BaseSectionImplUnion,
): boolean {
  return isBaseSectionWithParamsImpl(sectionImpl)
    ? sectionImpl.isFrozen
    : false;
}

export function resolvePasswordParamState(args: {
  codeObjImpl: BaseChildlessCodeObjImplUnion;
  stringValue: string;
}) {
  if (args.codeObjImpl.type !== CodeObjTypeEnum.PasswordParam) {
    return {
      passwordPlaceholder: undefined,
      showPasswordReveal: false,
    };
  }
  const hasSecret =
    "hasSecret" in args.codeObjImpl &&
    typeof args.codeObjImpl.hasSecret === "boolean"
      ? args.codeObjImpl.hasSecret
      : false;
  return {
    passwordPlaceholder:
      hasSecret && args.stringValue === "" ? "Saved" : undefined,
    showPasswordReveal: shouldShowPasswordReveal({
      value: args.stringValue,
      hasSecret,
    }),
  };
}

export function resolveParamRenderContext(
  props: AppParamUIProps,
): AppParamRenderContext {
  const {
    canEditParams,
    codeObjImpl,
    configId,
    isPasswordRevealPending,
    onChange,
    onDropzoneStateless,
    onRevealPassword,
    paramInfoId,
    sectionId,
    sectionImpl,
    value,
  } = props;
  const stringValue = _.toString(value ?? "");
  const { passwordPlaceholder, showPasswordReveal } = resolvePasswordParamState(
    {
      codeObjImpl,
      stringValue,
    },
  );
  return {
    codeObjImpl,
    configLanguage: resolveParamConfigLanguage(sectionImpl),
    configId,
    defaultVal: resolveParamDefaultValue(codeObjImpl),
    isDisabled: !canEditParams || isParamSectionFrozen(sectionImpl),
    isPasswordRevealPending: Boolean(isPasswordRevealPending),
    onChange,
    onDropzoneStateless,
    onEscape: noopAppParamEscape,
    onRevealPassword,
    paramInfoId,
    passwordPlaceholder,
    sectionId,
    showPasswordReveal,
    stringValue,
    value,
  };
}

export function resolveParamNumericRange(
  codeObjImpl: BaseChildlessCodeObjImplUnion,
) {
  return {
    min: "min" in codeObjImpl ? codeObjImpl.min ?? 0 : 0,
    max: "max" in codeObjImpl ? codeObjImpl.max ?? 100 : 100,
    step: "step" in codeObjImpl ? codeObjImpl.step ?? 1 : 1,
  };
}

export function resolveDropdownParamValue(
  value: string | number | boolean | null,
  stringValue: string,
): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (value !== null && value !== undefined) {
    return stringValue;
  }
  return null;
}

export function resolveDropzoneSettings(
  codeObjImpl: BaseChildlessCodeObjImplUnion,
) {
  return {
    mode:
      "mode" in codeObjImpl
        ? codeObjImpl.mode ?? DropzoneModeEnum.STATEFUL
        : DropzoneModeEnum.STATEFUL,
    maxAttachments:
      "maxAttachments" in codeObjImpl
        ? codeObjImpl.maxAttachments ?? null
        : null,
    placeholder:
      "placeholder" in codeObjImpl
        ? codeObjImpl.placeholder ?? undefined
        : undefined,
  };
}
