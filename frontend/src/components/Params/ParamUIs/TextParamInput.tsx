import _ from "lodash";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import { useShareCapabilities } from "state/hooks/share";
import {
  TextParamConfigForFrontend,
  useParamCodeObjUIConfig,
} from "state/hooks/uiTypes";
import { route_update_param_impl_config } from "utils/generatedEndpoints";
import {
  CodeObjTypeEnum,
  DateDisplayFormat,
  DateDisplayFormatEnum,
  TextParamInputUIType,
  TextParamInputUITypeEnum,
  TimeDisplayFormat,
  TimeDisplayFormatEnum,
} from "utils/generatedTypes";
import {
  formatDateForDisplay,
  formatTimeForDisplay,
  normalizeDateToIso,
  normalizeTimeTo24Hour,
} from "utils/textParamDateTime";
import type { ParamValueChange } from "./ConfiguredParamInputs";

const ROW_CLASS_NAME =
  "flex flex-grow items-center justify-between rounded-full px-3 py-[0.33rem] hover:bg-[#cbd5e02b]";
const LABEL_CLASS_NAME =
  "flex-1 font-sans text-xs font-semibold text-setta-600 dark:text-setta-400";
const SELECT_CLASS_NAME =
  "nodrag font-code cursor-pointer border-0 border-b border-solid border-setta-300 bg-transparent text-xs focus:border-blue-400 focus:outline-none focus-visible:border-blue-400 focus-visible:outline-none focus-visible:ring-0 dark:border-setta-700 dark:text-setta-300";

const UI_TYPE_OPTIONS: Array<{
  value: TextParamInputUIType;
  label: string;
}> = [
  { value: TextParamInputUITypeEnum.plain, label: "Plain text" },
  { value: TextParamInputUITypeEnum.time, label: "Time picker" },
  { value: TextParamInputUITypeEnum.date, label: "Date picker" },
];

const TIME_FORMAT_OPTIONS: Array<{
  value: TimeDisplayFormat;
  label: string;
}> = [
  { value: TimeDisplayFormatEnum.twenty_four_hour, label: "24-hour" },
  { value: TimeDisplayFormatEnum.twelve_hour, label: "12-hour" },
];

const DATE_FORMAT_OPTIONS: Array<{
  value: DateDisplayFormat;
  label: string;
}> = [
  { value: DateDisplayFormatEnum.iso, label: "ISO (YYYY-MM-DD)" },
  { value: DateDisplayFormatEnum.us, label: "US (MM/DD/YYYY)" },
  { value: DateDisplayFormatEnum.eu, label: "EU (DD/MM/YYYY)" },
  { value: DateDisplayFormatEnum.long, label: "Long (Month D, YYYY)" },
];

export function TextParamInputConfigForParam({
  sectionId,
  paramInfoId,
}: {
  sectionId: string;
  paramInfoId: string;
}) {
  const { canEditStructure } = useShareCapabilities();
  const config = useParamCodeObjUIConfig(
    sectionId,
    paramInfoId,
    CodeObjTypeEnum.TextParam,
  );

  function onConfigChange(nextConfig: Partial<TextParamConfigForFrontend>) {
    if (!canEditStructure) {
      return;
    }
    const merged: TextParamConfigForFrontend = {
      ...config,
      ...nextConfig,
    };
    const configClone = _.cloneDeep(merged);
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveCodeObjImplValue<"TextParamCodeObj">(
          state,
          sectionId,
          paramInfoId,
          configClone,
        );
      },
      send: (frontendOpId) =>
        route_update_param_impl_config({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          paramInfoId,
          newConfig: configClone,
          frontendOpId,
        }),
    });
  }

  return (
    <div className="mt-1 flex flex-col gap-1">
      <div className={ROW_CLASS_NAME}>
        <p className={LABEL_CLASS_NAME}>Input UI</p>
        <select
          className={SELECT_CLASS_NAME}
          value={config.uiType}
          onChange={(event) =>
            onConfigChange({
              uiType: event.target.value as TextParamInputUIType,
            })
          }
          disabled={!canEditStructure}
        >
          {UI_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {config.uiType === TextParamInputUITypeEnum.time ? (
        <div className={ROW_CLASS_NAME}>
          <p className={LABEL_CLASS_NAME}>Time Display</p>
          <select
            className={SELECT_CLASS_NAME}
            value={config.timeDisplayFormat}
            onChange={(event) =>
              onConfigChange({
                timeDisplayFormat: event.target.value as TimeDisplayFormat,
              })
            }
            disabled={!canEditStructure}
          >
            {TIME_FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {config.uiType === TextParamInputUITypeEnum.date ? (
        <div className={ROW_CLASS_NAME}>
          <p className={LABEL_CLASS_NAME}>Date Display</p>
          <select
            className={SELECT_CLASS_NAME}
            value={config.dateDisplayFormat}
            onChange={(event) =>
              onConfigChange({
                dateDisplayFormat: event.target.value as DateDisplayFormat,
              })
            }
            disabled={!canEditStructure}
          >
            {DATE_FORMAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

export function TextParamDateTimeInput({
  value,
  onChange,
  onEscape,
  isDisabled,
  uiType,
  timeDisplayFormat,
  dateDisplayFormat,
  wrapperClassName,
  inputClassName,
  formattedValueClassName,
  borderClassName,
}: {
  value: string;
  onChange: ParamValueChange;
  onEscape?: () => void;
  isDisabled: boolean;
  uiType: TextParamInputUIType;
  timeDisplayFormat: TimeDisplayFormat;
  dateDisplayFormat: DateDisplayFormat;
  wrapperClassName?: string;
  inputClassName?: string;
  formattedValueClassName?: string;
  borderClassName?: string;
}) {
  const effectiveWrapperClassName =
    wrapperClassName ?? "section-value flex min-w-0 items-center gap-2";
  const effectiveInputClassName =
    inputClassName ??
    `${!isDisabled ? "cursor-text select-text" : ""} nodrag peer/textinput flex min-w-0 flex-1 self-center font-mono text-xs text-[rgb(3,_47,_98);] dark:text-[rgb(165,_214,_255)]`;
  const effectiveFormattedClassName =
    formattedValueClassName ??
    "text-[10px] font-mono text-setta-500 dark:text-setta-400";
  const effectiveBorderClassName =
    borderClassName ??
    "section-value grid-row-start-1 border-box self-end border-b border-setta-200/50 dark:border-setta-600/30 peer-focus-within/textinput:border-blue-400";

  const normalizedValue =
    uiType === TextParamInputUITypeEnum.time
      ? normalizeTimeTo24Hour(value)
      : normalizeDateToIso(value, dateDisplayFormat);
  const formattedValue =
    uiType === TextParamInputUITypeEnum.time
      ? formatTimeForDisplay(normalizedValue, timeDisplayFormat)
      : formatDateForDisplay(normalizedValue, dateDisplayFormat);
  const inputType = uiType === TextParamInputUITypeEnum.time ? "time" : "date";

  return (
    <>
      <div className={effectiveWrapperClassName}>
        <input
          type={inputType}
          className={effectiveInputClassName}
          value={normalizedValue}
          onChange={(event) => {
            if (uiType === TextParamInputUITypeEnum.time) {
              onChange(normalizeTimeTo24Hour(event.target.value));
              return;
            }
            onChange(normalizeDateToIso(event.target.value, dateDisplayFormat));
          }}
          onKeyDown={(event) => {
            if (event.code === "Escape") {
              onEscape?.();
            }
          }}
          disabled={isDisabled}
        />
        <span className={effectiveFormattedClassName}>{formattedValue}</span>
      </div>
      <span className={effectiveBorderClassName} />
    </>
  );
}
