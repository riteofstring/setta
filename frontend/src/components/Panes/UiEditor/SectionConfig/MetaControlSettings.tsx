import { UIConfigDropdownAndFields } from "components/Panes/UiEditor/UIConfig/UIConfigDropdownAndFields";
import { OnSelectedItemChangeFnType } from "components/Utils/Combobox/ComboboxStateReducer";
import _ from "lodash";
import type { ReactNode } from "react";
import {
  getCurrCodeObjVariant,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  getParamDisplayName,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { SectionTypeEnum } from "utils/generatedTypes";
import { SaveUITypeConfig } from "../SaveUITypeConfig";
import { applyUiTypeComboboxSelection } from "../UIConfig/applyUiTypeComboboxSelection";

type MetaControlConfigState = {
  controlParamId: string | null;
  baseImplId: string | null;
  paramName: string;
};

export function MetaControlSettings({ sectionId }: { sectionId: string }) {
  const { canEditStructure } = useShareCapabilities();
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
      const paramName = getParamDisplayName(x, sectionId, controlParamId);
      return {
        controlParamId,
        baseImplId: variant.impl,
        paramName,
      };
    },
    _.isEqual,
  );

  const onSelect: OnSelectedItemChangeFnType<string> = (selectedId) => {
    if (!canEditStructure) {
      return;
    }
    if (!selectedId || !controlParamId) {
      throw new Error();
    }
    void applyUiTypeComboboxSelection({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      paramInfoId: controlParamId,
      selectedId,
      filterKey: "control",
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
          codeObjTypeFilterKey="control"
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
