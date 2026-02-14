import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { route_set_parent_default_child_section_type } from "utils/generatedEndpoints";
import { SectionType, SectionTypeEnum } from "utils/generatedTypes";

const DISALLOWED_CHILD_DEFAULTS = new Set<SectionType>([
  SectionTypeEnum.GlobalVariables,
  SectionTypeEnum.GenPythonCode,
  SectionTypeEnum.GenPythonMetadata,
]);

const CHILD_SECTION_TYPE_OPTIONS = (Object.values(SectionTypeEnum) as Array<SectionType>)
  .filter((type) => !DISALLOWED_CHILD_DEFAULTS.has(type))
  .map((type) => ({ value: type, label: type }));

export function ChildDefaultsSettings({ sectionId }: { sectionId: string }) {
  const { canEditStructure } = useShareCapabilities();
  const { sectionType, defaultChildSectionType, isFrozen } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    if (
      impl.type !== SectionTypeEnum.ListRoot &&
      impl.type !== SectionTypeEnum.Group
    ) {
      throw new Error(
        `ChildDefaultsSettings requires ListRoot or Group section. Got ${impl.type}.`,
      );
    }
    return {
      sectionType: impl.type,
      defaultChildSectionType: impl.defaultChildSectionType,
      isFrozen: impl.isFrozen,
    };
  });

  function onChangeDefaultChildSectionType(nextType: SectionType) {
    if (!canEditStructure) {
      return;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        if (sectionType === SectionTypeEnum.ListRoot) {
          setCurrEffectiveSectionImplValue<"ListRootSection">(state, sectionId, {
            defaultChildSectionType: nextType,
          });
          return;
        }
        setCurrEffectiveSectionImplValue<"GroupSection">(state, sectionId, {
          defaultChildSectionType: nextType,
        });
      },
      send: (frontendOpId) =>
        route_set_parent_default_child_section_type({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          defaultChildSectionType: nextType,
          frontendOpId,
        }),
    });
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-setta-200/60 p-2 dark:border-setta-700/60">
      <p className="text-xs font-bold text-setta-700 dark:text-setta-300">
        Default Child Section
      </p>
      <p className="text-[11px] text-setta-500 dark:text-setta-400">
        Incrementer-created children will use this section type by default.
      </p>
      <select
        className="rounded-md border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 focus-visible:border-blue-400 focus-visible:outline-none dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200"
        value={defaultChildSectionType}
        onChange={(event) =>
          onChangeDefaultChildSectionType(event.target.value as SectionType)
        }
        disabled={isFrozen || !canEditStructure}
      >
        {CHILD_SECTION_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
