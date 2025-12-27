import {
  ComboboxItemArrayType,
  OnSelectedItemChangeFnType,
} from "components/Utils/Combobox/ComboboxStateReducer";
import { UIConfigDropdownAndFields } from "components/Panes/UiEditor/UIConfig/UIConfigDropdownAndFields";
import _ from "lodash";
import {
  getCodeObjCore,
  getCurrCodeObjVariant,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { route_change_param_impl } from "utils/generatedEndpoints";
import {
  ActionControlType,
  CodeObjType,
  CodeObjTypeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { SaveUITypeConfig } from "../SaveUITypeConfig";

type MetaControlConfigState = {
  actionControlType: ActionControlType | null;
  controlParamId: string | null;
  baseImplId: string | null;
  paramName: string;
};

const CONTROL_CODE_OBJ_TYPES: Array<CodeObjType> = [
  CodeObjTypeEnum.CodeParam,
  CodeObjTypeEnum.TextParam,
  CodeObjTypeEnum.TextAreaParam,
  CodeObjTypeEnum.SliderParam,
  CodeObjTypeEnum.RotaryParam,
  CodeObjTypeEnum.SwitchParam,
  CodeObjTypeEnum.ColorPickerParam,
  CodeObjTypeEnum.DropdownParam,
  CodeObjTypeEnum.PasswordParam,
  CodeObjTypeEnum.DropzoneParam,
];

export function MetaControlSettings({ sectionId }: { sectionId: string }) {
  const presetCodeObjImpls = useProjectState((x) => {
    const output: ComboboxItemArrayType<string> = [];
    for (const c of Object.values(x.codeObjImpls)) {
      if (c.isPreset) {
        output.push({
          id: c.id,
          name: `${c.name} - (${c.type})`,
        });
      }
    }
    return output;
  }, _.isEqual);

  const { actionControlType, controlParamId, baseImplId, paramName } =
    useProjectState((x): MetaControlConfigState => {
      const impl = getCurrEffectiveSectionImplOfType(
        x,
        sectionId,
        SectionTypeEnum.MetaControl,
      );
      if (impl.actionControlType !== null) {
        return {
          actionControlType: impl.actionControlType,
          controlParamId: null,
          baseImplId: null,
          paramName: "",
        };
      }

      const controlParamId = impl.controlParamId;
      if (!controlParamId) {
        return {
          actionControlType: impl.actionControlType,
          controlParamId: null,
          baseImplId: null,
          paramName: "",
        };
      }

      const variant = getCurrCodeObjVariant(x, sectionId, controlParamId);
      const paramName = getCodeObjCore(x, controlParamId).name;
      return {
        actionControlType: impl.actionControlType,
        controlParamId,
        baseImplId: variant.impl,
        paramName,
      };
    }, _.isEqual);

  const onSelect: OnSelectedItemChangeFnType<string> = (selectedId) => {
    if (!selectedId) {
      throw new Error();
    }
    if (!controlParamId) {
      throw new Error();
    }
    route_change_param_impl({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      paramInfoId: controlParamId,
      selectedId,
    });
  };

  if (actionControlType !== null || !controlParamId || !baseImplId) {
    return null;
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-scroll [&>*]:mx-[2px]">
      <div className="flex items-center justify-between">
        <p className="uicfg-title truncate text-xs font-semibold text-setta-500">
          {paramName}
        </p>
        <div className="flex gap-[0.1rem] place-self-end">
          <SaveUITypeConfig />
        </div>
      </div>
      <UIConfigDropdownAndFields
        sectionId={sectionId}
        paramInfoId={controlParamId}
        baseImplId={baseImplId}
        presetCodeObjImpls={presetCodeObjImpls}
        onDropdownSelect={onSelect}
        allowedImplTypes={CONTROL_CODE_OBJ_TYPES}
      />
    </div>
  );
}
