import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { useShareCapabilities } from "state/hooks/share";
import { useParamCodeObjUIConfig } from "state/hooks/uiTypes";
import { route_update_param_impl_config } from "utils/generatedEndpoints";
import { CodeObjTypeEnum } from "utils/generatedTypes";

export function ButtonInputConfigForParam({
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
    CodeObjTypeEnum.ButtonParam,
  );

  function onSetLabel(nextLabel: string) {
    if (!canEditStructure) {
      return;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveCodeObjImplValue<"ButtonParamCodeObj">(
          state,
          sectionId,
          paramInfoId,
          {
            label: nextLabel,
          },
        );
      },
      send: (frontendOpId) =>
        route_update_param_impl_config({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          paramInfoId,
          newConfig: {
            label: nextLabel,
          },
          frontendOpId,
        }),
    });
  }

  const { inputValue, onChange, onBlur, onKeyDown } = useEditableOnSubmit(
    config.label ?? "",
    onSetLabel,
    (value: string) => value.trim() !== "",
  );

  return (
    <div className="mt-1 flex flex-col">
      <div className="flex flex-grow items-center justify-between rounded-full px-3 py-[0.33rem] hover:bg-[#cbd5e02b]">
        <p className="flex-1 font-sans text-xs font-semibold text-setta-600">
          Label
        </p>
        <input
          className="nodrag font-code cursor-auto border-0 border-b border-solid border-setta-300 text-xs focus-visible:border-blue-400 dark:border-setta-700 dark:text-setta-300"
          value={inputValue}
          onChange={onChange}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder="Trigger"
          disabled={!canEditStructure}
        />
      </div>
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
