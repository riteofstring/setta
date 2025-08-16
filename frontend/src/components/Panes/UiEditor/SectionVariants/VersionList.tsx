import _ from "lodash";
import { useState } from "react";
import { FaRegSnowflake } from "react-icons/fa";
import { FiFileText } from "react-icons/fi";
import { HiHome } from "react-icons/hi";
import { updateBackendProjectState } from "state/actions/project/generateCode";
import {
  deleteSectionVariantAndMaybeJsonFile,
  getCurrProjectConfigId,
  getEffectiveImpl,
  getSectionCore,
  getSectionImpl,
  getSectionVariant,
  updateProjectState,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { route_create_new_section_version } from "utils/generatedEndpoints";

export function VersionList({ sectionId }) {
  const [isEditing, setIsEditing] = useState(false);

  function onClickEditButton() {
    setIsEditing(!isEditing);
  }

  function onClickAddVersionButton() {
    route_create_new_section_version({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
    });
  }

  return (
    <section className="section-grid-cols section-grid-rows section-grid-areas -mx-3 -my-4 grid flex-1 self-stretch">
      <header className="absolute right-16 top-[15px] flex items-center gap-2">
        {/* <p className="text-xs text-setta-400 dark:text-setta-600">Name</p> */}
        {!isEditing && (
          <button
            className="flex cursor-pointer items-center justify-center gap-1 rounded-md  px-2 py-1 text-xs font-bold text-setta-400 hover:bg-setta-500/20 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-400"
            onClick={onClickAddVersionButton}
          >
            Add Version
          </button>
        )}
        <button
          className="flex cursor-pointer items-center justify-center gap-1 rounded-md  px-2 py-1 text-xs font-bold text-setta-400 hover:bg-setta-500/20 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-400"
          onClick={onClickEditButton}
        >
          <i className="gg-pen" />
          {isEditing ? "Done Editing" : "Edit"}
        </button>
      </header>
      <ul
        className="section-full nodrag nowheel grid auto-rows-min grid-cols-subgrid gap-y-2 overflow-y-auto overflow-x-clip pt-6"
        // onMouseLeave={() => onMouseLeaveSetPreviewVariantId(sectionId)}
      >
        <EVItems sectionId={sectionId} isEditing={isEditing} />
      </ul>
    </section>
  );
}

function EVItems({
  sectionId,
  isEditing,
}: {
  sectionId: string;
  isEditing: boolean;
}) {
  const { currVersionId, versionIds, defaultVersionId } = useProjectState(
    (x) => {
      const sectionCore = getSectionCore(x, sectionId);
      const { variants, defaultVariant } = sectionCore;
      const currVariant = x.projectConfig.sectionVariantMap[sectionId];
      return {
        currVersionId: currVariant,
        versionIds: variants,
        defaultVersionId: defaultVariant,
      };
    },
    _.isEqual,
  );

  console.log("versionIds", versionIds);

  if (isEditing) {
    return versionIds.map((e) => (
      <OneItemEditing
        key={e}
        sectionId={sectionId}
        id={e}
        isCurr={currVersionId === e}
        deletable={versionIds.length > 1}
      />
    ));
  }

  return versionIds.map((e) => (
    <OneItem
      key={e}
      sectionId={sectionId}
      id={e}
      isCurr={currVersionId === e}
      isDefault={e === defaultVersionId}
    />
  ));
}

function OneItem({
  sectionId,
  id,
  isCurr,
  isDefault,
}: {
  sectionId: string;
  id: string;
  isCurr: boolean;
  isDefault: boolean;
}) {
  const { name, isFrozen, isJsonSource } = useProjectState((x) => {
    const variant = getSectionVariant(x, id);
    const baseImpl = getSectionImpl(x, variant.impl);
    const core = getSectionCore(x, sectionId);
    const impl = getEffectiveImpl(baseImpl, core, variant);
    return {
      name: variant.name,
      isFrozen: impl.isFrozen,
      isJsonSource: false,
    };
  }, _.isEqual);

  return (
    <li
      // onMouseEnter={() => onMouseEnterSetPreviewVariantId(sectionId, id)}
      onClick={() => {
        useProjectState.setState((state) => {
          state.projectConfig.sectionVariantMap[sectionId] = id;
        });
        updateBackendProjectState();
      }}
      className={`section-key-value group/versionitem -my-[0.125rem] flex h-min cursor-pointer items-center justify-between rounded-sm border-b border-transparent px-1 py-[0.125rem] text-xs hover:bg-setta-200/30 dark:hover:bg-setta-700/50 ${isCurr ? "bg-blue-500 dark:bg-blue-700" : ""}`}
    >
      <p
        className={`section-key truncate ${
          isCurr
            ? "font-medium text-white group-hover/versionitem:text-setta-800 group-hover/versionitem:dark:text-setta-100"
            : "text-setta-400 dark:text-setta-400"
        } `}
      >
        {name}
      </p>
      <div className="flex items-center gap-2">
        <button
          className={`cursor-pointer bg-transparent ${
            isDefault
              ? "text-green-500"
              : "text-transparent hover:!text-setta-400 group-hover/versionitem:text-setta-400/50"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            useProjectState.setState((x) => {
              const section = getSectionCore(x, sectionId);
              section.defaultVariant = id;
            });
          }}
        >
          <HiHome />
        </button>
        <button
          className={`cursor-pointer bg-transparent ${
            isFrozen
              ? "text-blue-500"
              : "text-transparent hover:!text-blue-400 group-hover/versionitem:text-setta-400/50"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            useProjectState.setState((x) => {
              const variant = getSectionVariant(x, id);
              variant.modifier.isFrozen = !isFrozen;
            });
          }}
        >
          <FaRegSnowflake />
        </button>
        <button
          className={`cursor-pointer bg-transparent ${
            isJsonSource
              ? "text-orange-500"
              : "text-transparent hover:!text-orange-400 group-hover/versionitem:text-setta-400/50"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            const newIsJsonSource = !isJsonSource;
            const newConfigLanguage = newIsJsonSource ? "json" : "python";
            useProjectState.setState((state) => {
              state.variants[id].isJsonSource = newIsJsonSource;
              state.variants[id].configLanguage = newConfigLanguage;
            });
            maybeLoadJsonContents(id);
          }}
        >
          <FiFileText />
        </button>
      </div>
    </li>
  );
}

function OneItemEditing({
  sectionId,
  id,
  isCurr,
  deletable,
}: {
  sectionId: string;
  id: string;
  isCurr: boolean;
  deletable: boolean;
}) {
  const name = useProjectState((x) => {
    const variant = getSectionVariant(x, id);
    return variant.name;
  }, _.isEqual);

  function onSetName(v: string) {
    useProjectState.setState((x) => {
      const variant = getSectionVariant(x, id);
      variant.name = v;
    });
    // maybeLoadJsonContents(id);
  }

  function conditionToSetName(v: string) {
    const state = useProjectState.getState();
    const section = getSectionCore(state, sectionId);
    for (const variantId of section.variants) {
      if (getSectionVariant(state, variantId).name === v) {
        return false;
      }
    }
    return true;
  }

  const [inputValue, onChange, onBlur, onKeyDown] = useEditableOnSubmit(
    name,
    onSetName,
    conditionToSetName,
  );

  function onClickDelete(e) {
    e.stopPropagation();
    deleteSectionVariantAndMaybeJsonFile(sectionId, id, isCurr);
  }

  return (
    <li className="section-key-value group/versionitem -my-[0.125rem] flex h-min cursor-pointer items-center justify-between border-b border-setta-200 px-1 py-[0.125rem] text-xs focus-within:!border-blue-500  hover:border-setta-500 dark:border-setta-700 dark:hover:border-setta-500 ">
      <input
        value={inputValue}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className="flex-1 truncate text-setta-500 focus:text-setta-900 focus:outline-none focus:ring-0 dark:text-setta-400 dark:focus:text-setta-200"
      />

      {deletable && (
        <button
          className={
            "cursor-pointer bg-transparent text-transparent hover:!text-red-500 active:!text-red-700 group-hover/versionitem:text-setta-400/50"
          }
          onClick={onClickDelete}
        >
          <i className="gg-trash" />
        </button>
      )}
    </li>
  );
}

async function maybeLoadJsonContents(variantId) {
  if (useProjectState.getState().variants[variantId].isJsonSource) {
    const { variants, codeInfo, codeInfoCols } = await loadJsonContents([
      variantId,
    ]);
    useProjectState.setState((state) => {
      updateProjectState({
        variants,
        codeInfo,
        codeInfoCols,
        state,
      });
    });
  }
}
