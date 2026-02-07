import type { OnSelectedItemChangeFnType } from "components/Utils/Combobox/ComboboxStateReducer";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import _ from "lodash";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import { useShareCapabilities } from "state/hooks/share";
import {
  DropdownConfigForFrontend,
  useParamCodeObjUIConfig,
} from "state/hooks/uiTypes";
import { route_update_param_impl_config } from "utils/generatedEndpoints";
import { CodeObjTypeEnum } from "utils/generatedTypes";

export function DropdownInputConfigForParam({
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
    CodeObjTypeEnum.DropdownParam,
  );

  function onChange(newConfig: DropdownConfigForFrontend) {
    if (!canEditStructure) {
      return;
    }
    const configClone = _.cloneDeep(newConfig);
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveCodeObjImplValue<"DropdownParamCodeObj">(
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
    <DropdownInputConfig
      config={config}
      onChange={onChange}
      isDisabled={!canEditStructure}
    />
  );
}

function DropdownInputConfig({
  onChange,
  config,
  isDisabled,
}: {
  onChange: (x: DropdownConfigForFrontend) => void;
  config: DropdownConfigForFrontend;
  isDisabled: boolean;
}) {
  const choices = config.choices ?? [];

  const addChoice = () => {
    const newChoices = [...choices, ""];
    onChange({ choices: newChoices });
  };

  const removeChoice = (removeIdx: number) => {
    const newChoices = choices.filter((c, idx) => idx !== removeIdx);
    onChange({ choices: newChoices });
  };

  const updateChoice = (updateIdx: number, newChoice: string) => {
    const newChoices = choices.map((c, idx) =>
      idx === updateIdx ? newChoice : c,
    );
    onChange({ choices: newChoices });
  };

  return (
    <>
      <button
        onClick={addChoice}
        className="my-1 flex cursor-pointer items-center justify-between rounded-xl bg-setta-100 px-3  py-0.5 uppercase text-setta-500 hover:bg-setta-200 dark:bg-setta-850 dark:text-setta-500 dark:hover:bg-setta-850"
        aria-label="Add choice"
        disabled={isDisabled}
      >
        <p className="text-sm font-black ">Add Choices</p>
        <i className="gg-add !scale-90" />
      </button>

      <div className="flex flex-col gap-2 overflow-y-auto">
        {choices.map((c, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="flex flex-auto items-center gap-1 overflow-hidden">
              <input
                type="text"
                value={c}
                onChange={(e) => updateChoice(idx, e.target.value)}
                placeholder="Add description..."
                className="m-[2px] w-full truncate rounded border px-2 py-1 text-xs text-setta-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-setta-400 dark:placeholder-setta-700"
                disabled={isDisabled}
              />
            </div>
            <button
              onClick={() => removeChoice(idx)}
              className="flex cursor-pointer items-center rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Remove choice"
              disabled={isDisabled}
            >
              <i className="gg-close !scale-75" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export function DropdownInput({
  choices,
  value,
  onChange,
  outerDivClasses,
  inputOuterClasses,
  comboboxInputThemeClassName,
  comboboxRightButtonThemeClassName,
  comboboxListThemeClassName,
  isDisabled,
  placeholder,
  small = true,
}: {
  choices: Array<string>;
  value: string | null;
  onChange: OnSelectedItemChangeFnType<string>;
  outerDivClasses?: string;
  inputOuterClasses?: string;
  comboboxInputThemeClassName?: string;
  comboboxRightButtonThemeClassName?: string;
  comboboxListThemeClassName?: string;
  isDisabled?: boolean;
  placeholder?: string;
  small?: boolean;
}) {
  const allItems = [
    {
      group: "Choices",
      items: choices.map((c) => ({ id: c, name: c })),
    },
  ];

  return (
    <IdNameCombobox
      outerDivClasses={outerDivClasses}
      allItems={allItems}
      value={value ? value : null}
      onSelectedItemChange={onChange}
      small={small}
      isDisabled={isDisabled}
      placeholder={placeholder}
      inputOuterClasses={inputOuterClasses}
      inputThemeClassName={comboboxInputThemeClassName}
      rightButtonThemeClassName={comboboxRightButtonThemeClassName}
      listThemeClassName={comboboxListThemeClassName}
    />
  );
}
