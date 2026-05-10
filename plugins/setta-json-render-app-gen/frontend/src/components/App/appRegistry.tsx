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

import "katex/dist/katex.min.css";

import _ from "lodash";

import React from "react";

import ReactMarkdown from "react-markdown";

import rehypeKatex from "rehype-katex";

import remarkGfm from "remark-gfm";

import remarkMath from "remark-math";

import {
  useAppSubsystemFrontendHost,
  useAppSubsystemServerModeState,
} from "../../appSubsystemFrontendHostContext";

import {
  useAppConfigs,
  type AppConfigState,
} from "../../appSubsystemProjectState";

import { useDecodedAppImageById } from "../../appSubsystemImageArtifacts";

import { useLocalPendingValue } from "../../appSubsystemPendingValue";

import { ensureAppProjectConfigLoaded } from "../../state/actions/app";

import {
  resolveActionBinding,
  resolveActionType,
  resolveImageOutputBinding,
  resolveParamBinding,
  resolveTextOutputBinding,
} from "./appBindings";

import type { AppThemeHeadingSizes } from "./appTheme";

import {
  AppConfigScopeContext,
  useAppActionState,
  useAppConfigScope,
  useAppRuntime,
} from "./appContext";

import { resolveResponsiveValue, useAppBreakpoint } from "./appResponsive";

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
} from "../ui/AppRuntimeControls";

import { SwitchInput } from "../ui/SwitchInput";

export { appRegistry } from "./appRegistry/actionsAndRegistry";
