import { UIConfigDropdownAndFields } from "components/Panes/UiEditor/UIConfig/UIConfigDropdownAndFields";
import {
  ComboboxItemArrayType,
  OnSelectedItemChangeFnType,
} from "components/Utils/Combobox/ComboboxStateReducer";
import _ from "lodash";
import type { ReactNode } from "react";
import {
  getCodeObjCore,
  getCurrCodeObjVariant,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { route_change_param_impl } from "utils/generatedEndpoints";
import {
  CodeObjType,
  CodeObjTypeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { SaveUITypeConfig } from "../SaveUITypeConfig";

type MetaControlConfigState = {
  controlParamId: string | null;
  baseImplId: string | null;
  paramName: string;
};

const CONTROL_CODE_OBJ_TYPES: Array<CodeObjType> = [
  CodeObjTypeEnum.CodeParam,
  CodeObjTypeEnum.TextParam,
  CodeObjTypeEnum.ButtonParam,
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
      if (!c.isPreset) {
        continue;
      }
      if (!CONTROL_CODE_OBJ_TYPES.includes(c.type)) {
        continue;
      }
      output.push({
        id: c.id,
        name: `${c.name} - (${c.type})`,
      });
    }
    return output;
  }, _.isEqual);

  const { controlParamId, baseImplId, paramName } = useProjectState(
    (x): MetaControlConfigState => {
      const impl = getCurrEffectiveSectionImplOfType(
        x,
        sectionId,
        SectionTypeEnum.MetaControl,
      );
      const controlParamId = impl.metaControlParamId;
      if (!controlParamId) {
        return {
          controlParamId: null,
          baseImplId: null,
          paramName: "",
        };
      }

      const variant = getCurrCodeObjVariant(x, sectionId, controlParamId);
      const paramName = getCodeObjCore(x, controlParamId).name;
      return {
        controlParamId,
        baseImplId: variant.impl,
        paramName,
      };
    },
    _.isEqual,
  );

  const onSelect: OnSelectedItemChangeFnType<string> = (selectedId) => {
    if (!selectedId || !controlParamId) {
      throw new Error();
    }
    route_change_param_impl({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      paramInfoId: controlParamId,
      selectedId,
    });
  };

  if (!controlParamId || !baseImplId) {
    return null;
  }

  const containerClassName =
    "flex flex-1 flex-col gap-2 overflow-y-scroll [&>*]:mx-[2px]";

  return (
    <div className={containerClassName}>
      <MetaControlConfigCard title={paramName}>
        <UIConfigDropdownAndFields
          sectionId={sectionId}
          paramInfoId={controlParamId}
          baseImplId={baseImplId}
          presetCodeObjImpls={presetCodeObjImpls}
          allowedImplTypes={CONTROL_CODE_OBJ_TYPES}
          onDropdownSelect={onSelect}
        />
      </MetaControlConfigCard>
    </div>
  );
}

function MetaControlConfigCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col self-stretch text-left last:mb-[400px] hover:opacity-100 hover:duration-500 [&:hover_.uicfg-title]:text-black dark:[&:hover_.uicfg-title]:text-setta-200">
      <div className="flex items-center justify-between">
        <p className="uicfg-title truncate text-xs font-semibold text-setta-500">
          {title}
        </p>
        <div className="flex gap-[0.1rem] place-self-end">
          <SaveUITypeConfig />
        </div>
      </div>
      {children}
    </div>
  );
}
