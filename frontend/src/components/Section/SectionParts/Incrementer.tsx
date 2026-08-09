import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import _ from "lodash";
import {
  createChildSectionsViaIncrementer,
  deleteChildSectionsViaDecrementer,
} from "openapi/http";
import { useState } from "react";
import { TbSortDescendingSmallBig } from "react-icons/tb";
import {
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { SectionTypeEnum } from "utils/generatedTypes";
export function Incrementer({
  sectionId,
  isRoot,
  popover = false,
}: {
  sectionId: string;
  isRoot: boolean;
  popover?: boolean;
}) {
  const { variantIsFrozen, defaultChildSectionType } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    const defaultChildSectionType =
      impl.type === SectionTypeEnum.ListRoot ||
      impl.type === SectionTypeEnum.Group
        ? impl.defaultChildSectionType
        : SectionTypeEnum.Callable;
    return {
      variantIsFrozen: impl.isFrozen,
      defaultChildSectionType,
    };
  }, _.isEqual);
  const { canEditStructure } = useShareCapabilities();
  const [numSections, setNumSections] = useState<number | "">(1);
  const numSectionsOnChange = (value: string) => {
    if (value === "") {
      setNumSections("");
    } else {
      const parsed = parseInt(value);
      if (!isNaN(parsed) && parsed >= 0) {
        setNumSections(parsed);
      }
      // Invalid input - don't update state
    }
  };
  const numSectionsOnBlur = () => {
    if (numSections === "" || numSections === 0) {
      setNumSections(1); // Reset to default/minimum value
    }
  };
  const addSections = () => {
    if (!canEditStructure) {
      return;
    }
    if (typeof numSections === "string") return;
    callOpenAPI(
      createChildSectionsViaIncrementer({
        body: {
          projectConfigId: getCurrProjectConfigId(),
          calledBy: sectionId,
          implType: defaultChildSectionType,
          numChildren: numSections,
        },
      } as Parameters<typeof createChildSectionsViaIncrementer>[0]),
    );
  };
  const deleteChildren = () => {
    if (!canEditStructure) {
      return;
    }
    if (typeof numSections === "string") return;
    callOpenAPI(
      deleteChildSectionsViaDecrementer({
        body: {
          projectConfigId: getCurrProjectConfigId(),
          calledBy: sectionId,
          numChildren: numSections,
        },
      } as Parameters<typeof deleteChildSectionsViaDecrementer>[0]),
    );
  };
  return (
    <div
      className={`section-key-value section-row-main -mx-2 flex items-center gap-1 rounded-lg  bg-setta-100 pl-2 pr-1 dark:bg-setta-950 ${popover ? "border border-solid border-white py-1 shadow-lg dark:border-setta-800" : ""}`}
    >
      {isRoot ? (
        <>
          <TbSortDescendingSmallBig className="text-setta-300 dark:text-setta-600" />
          <p className="text-[10px] font-bold text-setta-500">Children: </p>
        </>
      ) : (
        <p className="text-[10px] text-setta-500">Siblings</p>
      )}

      <input
        className="nodrag max-w-[3ch] cursor-auto rounded-md bg-white px-2 text-xs focus-visible:ring-2 dark:bg-setta-800 dark:text-setta-300"
        value={numSections}
        onChange={(e) => numSectionsOnChange(e.target.value)}
        onBlur={numSectionsOnBlur}
        disabled={variantIsFrozen || !canEditStructure}
      />

      <button
        className="nodrag gg-math-minus rounded-full focus-visible:ring-2 dark:text-setta-300"
        onClick={deleteChildren}
        role="button"
        disabled={variantIsFrozen || !canEditStructure}
      />

      <button
        className="nodrag gg-math-plus rounded-full focus-visible:ring-2 dark:text-setta-300"
        onClick={addSections}
        role="button"
        disabled={variantIsFrozen || !canEditStructure}
      />
    </div>
  );
}
