import _ from "lodash";
import { matchSorter } from "match-sorter";
import { buildParamTreeView } from "state/actions/params/paramTree";
import {
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
  getParamDisplayName,
} from "state/actions/sectionInfos";
import { useProjectState, type ZustandProjectState } from "state/definitions";
import {
  CodeObjTypeEnum,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";

export type SettingsAllSettingsBenchmarkParamRow = {
  depth: number;
  id: string;
  isParent: boolean;
  label: string;
  previewKind: string;
  previewTone: "group" | "code" | "text" | "toggle" | "choice" | "value";
};

export function useSettingsAllSettingsBenchmarkParamRows({
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
}: {
  sectionId: string;
  paramIds: Array<string>;
  requiredParamIdsToPaths: Record<string, Array<string>>;
}) {
  return useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      state,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const visibleRowIdSet = buildVisibleRowIdSet({
      sectionId,
      state,
      requiredParamIdsToPaths,
      paramFilter: impl.paramFilter,
    });
    if (paramIds.length === 0) {
      return [];
    }
    const tree = buildParamTreeView(
      state,
      sectionId,
      paramIds,
      requiredParamIdsToPaths,
    );
    return tree.flat
      .filter(
        (item) => visibleRowIdSet === null || visibleRowIdSet.has(item.id),
      )
      .map((item) => ({
        depth: item.depth,
        id: item.id,
        isParent: item.isParent,
        label: getParamDisplayName(state, sectionId, item.id),
        ...getPreviewMetadataForBenchmarkRow(state, sectionId, item.id, item.isParent),
      }));
  }, _.isEqual);
}

function getPreviewMetadataForBenchmarkRow(
  state: ZustandProjectState,
  sectionId: string,
  paramId: string,
  isParent: boolean,
): Pick<SettingsAllSettingsBenchmarkParamRow, "previewKind" | "previewTone"> {
  if (isParent) {
    return {
      previewKind: "Group",
      previewTone: "group",
    };
  }

  const impl = getCurrEffectiveCodeObjImpl(state, sectionId, paramId);
  switch (impl.type) {
    case CodeObjTypeEnum.CodeParam:
      return {
        previewKind: "Code",
        previewTone: "code",
      };
    case CodeObjTypeEnum.TextParam:
    case CodeObjTypeEnum.TextAreaParam:
      return {
        previewKind: "Text",
        previewTone: "text",
      };
    case CodeObjTypeEnum.SwitchParam:
      return {
        previewKind: "Toggle",
        previewTone: "toggle",
      };
    case CodeObjTypeEnum.DropdownParam:
      return {
        previewKind: "Choice",
        previewTone: "choice",
      };
    default:
      return {
        previewKind: "Value",
        previewTone: "value",
      };
  }
}

function buildVisibleRowIdSet({
  sectionId,
  state,
  requiredParamIdsToPaths,
  paramFilter,
}: {
  sectionId: string;
  state: ZustandProjectState;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  paramFilter: string;
}) {
  if (paramFilter.trim().length === 0) {
    return null;
  }

  const requiredParamIdsWithNames = Object.keys(requiredParamIdsToPaths).map(
    (id) => ({
      id,
      name: getParamDisplayName(state, sectionId, id),
    }),
  );
  const matches = matchSorter(requiredParamIdsWithNames, paramFilter, {
    keys: ["name"],
  });
  const filteredRequired = new Set<string>();
  for (const match of matches) {
    const path = requiredParamIdsToPaths[match.id];
    if (!path) {
      continue;
    }
    for (const paramId of path) {
      filteredRequired.add(paramId);
    }
  }
  return filteredRequired;
}

export function SettingsAllSettingsBenchmarkStaticParamRowItems({
  rows,
}: {
  rows: Array<SettingsAllSettingsBenchmarkParamRow>;
}) {
  return rows.map((row) => (
    <div
      key={row.id}
      className="flex min-w-0 items-center gap-2 rounded-sm px-2 py-1 text-[0.65rem] text-setta-600 dark:text-setta-200"
      data-param-row="true"
      data-settings-benchmark-static-param-row="true"
      style={{ paddingLeft: `${row.depth * 12 + 8}px` }}
    >
      <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-setta-300 dark:bg-setta-600" />
      <span className="truncate">{row.label}</span>
      {row.isParent && (
        <span className="ml-auto text-[0.5rem] uppercase tracking-[0.16em] text-setta-400 dark:text-setta-500">
          Group
        </span>
      )}
    </div>
  ));
}
