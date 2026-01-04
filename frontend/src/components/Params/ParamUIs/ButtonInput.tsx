import { ChangeEvent, useEffect, useState } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { useParamCodeObjUIConfig } from "state/hooks/uiTypes";
import { route_update_param_impl_config } from "utils/generatedEndpoints";
import type {
  ButtonActionMode,
  ButtonParamCodeObjImpl,
  HttpRequestMethod,
} from "utils/generatedTypes";
import {
  ButtonActionModeEnum,
  CodeObjTypeEnum,
  HttpRequestMethodEnum,
} from "utils/generatedTypes";

const ACTION_MODE_LABELS: Record<ButtonActionMode, string> = {
  [ButtonActionModeEnum.WEBSOCKET_LISTENER]: "Websocket listener",
  [ButtonActionModeEnum.HTTP_REQUEST]: "HTTP request",
};

const ACTION_MODE_OPTIONS: Array<ButtonActionMode> = [
  ButtonActionModeEnum.WEBSOCKET_LISTENER,
  ButtonActionModeEnum.HTTP_REQUEST,
];

const REQUEST_METHOD_OPTIONS: Array<HttpRequestMethod> = [
  HttpRequestMethodEnum.GET,
  HttpRequestMethodEnum.POST,
  HttpRequestMethodEnum.PUT,
  HttpRequestMethodEnum.PATCH,
  HttpRequestMethodEnum.DELETE,
  HttpRequestMethodEnum.HEAD,
  HttpRequestMethodEnum.OPTIONS,
];

const ROW_CLASS_NAME =
  "flex flex-grow items-center justify-between rounded-full px-3 py-[0.33rem] hover:bg-[#cbd5e02b]";
const LABEL_CLASS_NAME =
  "flex-1 font-sans text-xs font-semibold text-setta-600";
const INPUT_CLASS_NAME =
  "nodrag font-code cursor-auto border-0 border-b border-solid border-setta-300 text-xs focus-visible:border-blue-400 dark:border-setta-700 dark:text-setta-300";
const SELECT_CLASS_NAME =
  "nodrag font-code cursor-pointer border-0 border-b border-solid border-setta-300 bg-transparent text-xs focus:border-blue-400 focus:outline-none focus-visible:border-blue-400 focus-visible:outline-none focus-visible:ring-0 dark:border-setta-700 dark:text-setta-300";
const TEXTAREA_CLASS_NAME =
  "nodrag min-h-24 w-full resize-y rounded-md border border-solid border-setta-200 bg-white/80 p-2 font-mono text-xs text-setta-800 placeholder-setta-300 focus:!border-blue-500 focus:outline-0 focus:ring-0 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300 dark:placeholder-setta-600";

type ButtonConfigUpdate = Partial<
  Pick<
    ButtonParamCodeObjImpl,
    | "label"
    | "actionMode"
    | "requestMethod"
    | "requestUrl"
    | "requestHeaderKey"
    | "requestHeaderValue"
    | "requestBody"
  >
>;

export function ButtonInputConfigForParam({
  sectionId,
  paramInfoId,
}: {
  sectionId: string;
  paramInfoId: string;
}) {
  const config = useParamCodeObjUIConfig(
    sectionId,
    paramInfoId,
    CodeObjTypeEnum.ButtonParam,
  );

  function updateButtonConfig(nextConfig: ButtonConfigUpdate) {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveCodeObjImplValue<"ButtonParamCodeObj">(
          state,
          sectionId,
          paramInfoId,
          nextConfig,
        );
      },
      send: (frontendOpId) =>
        route_update_param_impl_config({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          paramInfoId,
          newConfig: nextConfig,
          frontendOpId,
        }),
    });
  }

  function onSetLabel(nextLabel: string) {
    updateButtonConfig({ label: nextLabel });
  }

  const labelField = useEditableOnSubmit(
    config.label,
    onSetLabel,
    (value: string) => value.trim() !== "",
  );

  const actionMode =
    config.actionMode ?? ButtonActionModeEnum.WEBSOCKET_LISTENER;
  const requestMethod = config.requestMethod ?? HttpRequestMethodEnum.POST;
  const showRequestFields = actionMode === ButtonActionModeEnum.HTTP_REQUEST;

  function onActionModeChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextMode = event.target.value as ButtonActionMode;
    updateButtonConfig({ actionMode: nextMode });
  }

  function onRequestMethodChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextMethod = event.target.value as HttpRequestMethod;
    updateButtonConfig({ requestMethod: nextMethod });
  }

  const urlField = useEditableOnSubmit(
    config.requestUrl,
    (nextUrl: string) => updateButtonConfig({ requestUrl: nextUrl.trim() }),
    () => true,
    true,
  );

  const headerKeyField = useEditableOnSubmit(
    config.requestHeaderKey,
    (nextKey: string) =>
      updateButtonConfig({ requestHeaderKey: nextKey.trim() }),
    () => true,
    true,
  );

  const headerValueField = useEditableOnSubmit(
    config.requestHeaderValue,
    (nextValue: string) =>
      updateButtonConfig({ requestHeaderValue: nextValue }),
    () => true,
    true,
  );

  const [requestBody, setRequestBody] = useState(config.requestBody);

  useEffect(() => {
    setRequestBody(config.requestBody);
  }, [config.requestBody]);

  function onRequestBodyChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setRequestBody(event.target.value);
  }

  function onRequestBodyBlur() {
    if (requestBody === config.requestBody) {
      return;
    }
    updateButtonConfig({ requestBody });
  }

  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className={ROW_CLASS_NAME}>
        <p className={LABEL_CLASS_NAME}>Label</p>
        <input
          className={INPUT_CLASS_NAME}
          value={labelField.inputValue}
          onChange={labelField.onChange}
          onBlur={labelField.onBlur}
          onKeyDown={labelField.onKeyDown}
          placeholder="Trigger"
        />
      </div>
      <div className={ROW_CLASS_NAME}>
        <p className={LABEL_CLASS_NAME}>Mode</p>
        <select
          className={SELECT_CLASS_NAME}
          value={actionMode}
          onChange={onActionModeChange}
        >
          {ACTION_MODE_OPTIONS.map((mode) => (
            <option key={mode} value={mode}>
              {ACTION_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
      </div>
      {showRequestFields ? (
        <>
          <div className={ROW_CLASS_NAME}>
            <p className={LABEL_CLASS_NAME}>Method</p>
            <select
              className={SELECT_CLASS_NAME}
              value={requestMethod}
              onChange={onRequestMethodChange}
            >
              {REQUEST_METHOD_OPTIONS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>
          <div className={ROW_CLASS_NAME}>
            <p className={LABEL_CLASS_NAME}>URL</p>
            <input
              className={INPUT_CLASS_NAME}
              value={urlField.inputValue}
              onChange={urlField.onChange}
              onBlur={urlField.onBlur}
              onKeyDown={urlField.onKeyDown}
              placeholder="/createTopLevelSection"
            />
          </div>
          <div className={ROW_CLASS_NAME}>
            <p className={LABEL_CLASS_NAME}>Header Key</p>
            <input
              className={INPUT_CLASS_NAME}
              value={headerKeyField.inputValue}
              onChange={headerKeyField.onChange}
              onBlur={headerKeyField.onBlur}
              onKeyDown={headerKeyField.onKeyDown}
              placeholder="Content-Type"
            />
          </div>
          <div className={ROW_CLASS_NAME}>
            <p className={LABEL_CLASS_NAME}>Header Value</p>
            <input
              className={INPUT_CLASS_NAME}
              value={headerValueField.inputValue}
              onChange={headerValueField.onChange}
              onBlur={headerValueField.onBlur}
              onKeyDown={headerValueField.onKeyDown}
              placeholder="application/json"
            />
          </div>
          <div className="flex flex-col gap-1 px-3">
            <p className="text-xs font-semibold text-setta-600">Body</p>
            <textarea
              className={TEXTAREA_CLASS_NAME}
              value={requestBody}
              onChange={onRequestBodyChange}
              onBlur={onRequestBodyBlur}
              placeholder='{"projectConfigId":"...","implType":"TextBlock","implOverrides":null,"controlCodeObjType":null,"position":null,"topLevelSections":{},"viewportBounds":null}'
              spellCheck="false"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

export function ButtonInput({
  label,
  onClick,
  isDisabled = false,
  wrapperClassName,
  buttonClassName,
}: {
  label: string;
  onClick: () => void;
  isDisabled?: boolean;
  wrapperClassName?: string;
  buttonClassName?: string;
}) {
  return (
    <div className={wrapperClassName}>
      <button
        type="button"
        className={buttonClassName}
        onClick={onClick}
        disabled={isDisabled}
      >
        {label}
      </button>
    </div>
  );
}
