import _ from "lodash";
import { useState } from "react";
import { FaRegSnowflake } from "react-icons/fa";
import { FiFileText } from "react-icons/fi";
import { HiHome } from "react-icons/hi";
import { openDeleteJSONSourceFileModal } from "state/actions/modal";
import { updateBackendProjectState } from "state/actions/project/generateCode";
import {
  getCurrProjectConfigId,
  getSectionCore,
  getSectionVariant,
  getVariantBaseAndEffectiveSectionImpl,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { res200 } from "utils/endpointUtils";
import {
  route_create_new_section_variant,
  route_delete_section_variant_or_ask,
  route_set_default_section_variant,
  route_set_section_variant,
  route_toggle_variant_json_source,
} from "utils/generatedEndpoints";
import { isBaseDictSectionImpl } from "utils/generatedTypes";

export function VariantList({ sectionId }) {
  const [isEditing, setIsEditing] = useState(false);

  function onClickEditButton() {
    setIsEditing(!isEditing);
  }

  function onClickAddVariantButton() {
    route_create_new_section_variant({
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
            onClick={onClickAddVariantButton}
          >
            Add Variant
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
        <VariantListCore sectionId={sectionId} isEditing={isEditing} />
      </ul>
    </section>
  );
}

function VariantListCore({
  sectionId,
  isEditing,
}: {
  sectionId: string;
  isEditing: boolean;
}) {
  const { currVariantId, variantIds, defaultVariantId } = useProjectState(
    (x) => {
      const sectionCore = getSectionCore(x, sectionId);
      const { variants, defaultVariant } = sectionCore;
      const currVariant = x.projectConfig.sectionVariantMap[sectionId];
      return {
        currVariantId: currVariant,
        variantIds: variants,
        defaultVariantId: defaultVariant,
      };
    },
    _.isEqual,
  );

  if (isEditing) {
    return variantIds.map((e) => (
      <OneVariantEditing
        key={e}
        sectionId={sectionId}
        id={e}
        deletable={variantIds.length > 1}
      />
    ));
  }

  return variantIds.map((e) => (
    <OneVariant
      key={e}
      sectionId={sectionId}
      id={e}
      isCurr={currVariantId === e}
      isDefault={e === defaultVariantId}
    />
  ));
}

function OneVariant({
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
  const { name, isFrozen, isJsonSource, canUseJsonSource } = useProjectState(
    (x) => {
      const { variant, impl } = getVariantBaseAndEffectiveSectionImpl(
        x,
        getSectionCore(x, sectionId),
        id,
      );
      const canUseJsonSource = isBaseDictSectionImpl(impl);
      const isJsonSource = canUseJsonSource && impl.isJsonSource;
      return {
        name: variant.name,
        isFrozen: variant.isFrozen,
        isJsonSource,
        canUseJsonSource,
      };
    },
    _.isEqual,
  );

  return (
    <li
      // onMouseEnter={() => onMouseEnterSetPreviewVariantId(sectionId, id)}
      onClick={() => {
        useProjectState.setState((state) => {
          state.projectConfig.sectionVariantMap[sectionId] = id;
        });
        route_set_section_variant({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          variantId: id,
        });
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
            e.stopPropagation(); // so that you can click on it without clicking on the variant
            useProjectState.setState((x) => {
              getSectionCore(x, sectionId).defaultVariant = id;
            });
            route_set_default_section_variant({
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              variantId: id,
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
            e.stopPropagation(); // so that you can click on it without clicking on the variant
            useProjectState.setState((x) => {
              getSectionVariant(x, id).isFrozen = !isFrozen;
            });
            updateBackendProjectState();
          }}
        >
          <FaRegSnowflake />
        </button>
        {canUseJsonSource && (
          <button
            className={`cursor-pointer bg-transparent ${
              isJsonSource
                ? "text-orange-500"
                : "text-transparent hover:!text-orange-400 group-hover/versionitem:text-setta-400/50"
            }`}
            onClick={(e) => {
              e.stopPropagation(); // so that you can click on it without clicking on the variant
              route_toggle_variant_json_source({
                projectConfigId: getCurrProjectConfigId(),
                sectionId,
                variantId: id,
              });
            }}
          >
            <FiFileText />
          </button>
        )}
      </div>
    </li>
  );
}

function OneVariantEditing({
  sectionId,
  id,
  deletable,
}: {
  sectionId: string;
  id: string;
  deletable: boolean;
}) {
  const name = useProjectState((x) => getSectionVariant(x, id).name);

  function onSetName(v: string) {
    useProjectState.setState((x) => {
      getSectionVariant(x, id).name = v;
    });
    updateBackendProjectState();
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

  const { inputValue, onChange, onBlur, onKeyDown } = useEditableOnSubmit(
    name,
    onSetName,
    conditionToSetName,
  );

  async function onClickDelete(e) {
    e.stopPropagation();
    const res = await route_delete_section_variant_or_ask({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      variantId: id,
    });
    if (res200(res) && res.data) {
      openDeleteJSONSourceFileModal(sectionId, id, res.data);
    }
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
