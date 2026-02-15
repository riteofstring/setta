import _ from "lodash";
import { useState } from "react";
import { FaRegSnowflake } from "react-icons/fa";
import { FiFileText } from "react-icons/fi";
import { HiHome } from "react-icons/hi";
import { openDeleteJSONSourceFileModal } from "state/actions/modal";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
  getSectionCore,
  getSectionVariant,
  getVariantBaseAndEffectiveSectionImpl,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { useProjectState, useShareSession } from "state/definitions";
import { useEditableOnSubmit } from "state/hooks/editableText";
import { useShareCapabilities } from "state/hooks/share";
import { res200 } from "utils/endpointUtils";
import {
  route_create_new_section_variant,
  route_delete_section_variant_or_ask,
  route_set_default_section_variant,
  route_set_section_variant,
  route_set_section_variant_name,
  route_toggle_variant_frozen,
  route_toggle_variant_json_source,
} from "utils/generatedEndpoints";
import {
  ConfigLanguageEnum,
  isBaseDictSectionImpl,
} from "utils/generatedTypes";

export function VariantList({ sectionId }) {
  const [isEditing, setIsEditing] = useState(false);
  const { canEditVariants } = useShareCapabilities();
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const allowVariantDeletion = canEditVariants && !isDeploymentMode;
  const isEditingEnabled = canEditVariants && isEditing;
  const actionButtonClasses = `flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${
    canEditVariants
      ? "cursor-pointer text-setta-400 hover:bg-setta-500/20 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-400"
      : "cursor-not-allowed text-setta-300 opacity-60 dark:text-setta-700"
  }`;

  function onClickEditButton() {
    if (!canEditVariants) {
      return;
    }
    setIsEditing(!isEditing);
  }

  function onClickAddVariantButton() {
    if (!canEditVariants) {
      return;
    }
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
            className={actionButtonClasses}
            onClick={onClickAddVariantButton}
            disabled={!canEditVariants}
          >
            Add Variant
          </button>
        )}
        <button
          className={actionButtonClasses}
          onClick={onClickEditButton}
          disabled={!canEditVariants}
        >
          <i className="gg-pen" />
          {isEditingEnabled ? "Done Editing" : "Edit"}
        </button>
      </header>
      <ul
        className="section-full setta-pane-scroll nodrag nowheel grid auto-rows-min grid-cols-subgrid gap-y-2 overflow-x-clip pt-6"
        onMouseLeave={() =>
          useProjectState.setState((x) => {
            delete x.previewSectionVariantMap[sectionId];
          })
        }
      >
        <VariantListCore
          sectionId={sectionId}
          isEditing={isEditingEnabled}
          canEditVariants={canEditVariants}
          allowVariantDeletion={allowVariantDeletion}
        />
      </ul>
    </section>
  );
}

function VariantListCore({
  sectionId,
  isEditing,
  canEditVariants,
  allowVariantDeletion,
}: {
  sectionId: string;
  isEditing: boolean;
  canEditVariants: boolean;
  allowVariantDeletion: boolean;
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
        canEditVariants={canEditVariants}
        allowVariantDeletion={allowVariantDeletion}
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
      canEditVariants={canEditVariants}
    />
  ));
}

function OneVariant({
  sectionId,
  id,
  isCurr,
  isDefault,
  canEditVariants,
}: {
  sectionId: string;
  id: string;
  isCurr: boolean;
  isDefault: boolean;
  canEditVariants: boolean;
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
      onMouseEnter={() =>
        useProjectState.setState((x) => {
          x.previewSectionVariantMap[sectionId] = id;
        })
      }
      onClick={
        canEditVariants
          ? () =>
              dispatchOptimisticProjectStateUpdate({
                apply: (state) => {
                  state.projectConfig.sectionVariantMap[sectionId] = id;
                },
                send: (frontendOpId) =>
                  route_set_section_variant({
                    projectConfigId: getCurrProjectConfigId(),
                    sectionId,
                    variantId: id,
                    frontendOpId,
                  }),
              })
          : undefined
      }
      aria-disabled={!canEditVariants}
      className={`section-key-value group/versionitem -my-[0.125rem] flex h-min items-center justify-between rounded-sm border-b border-transparent px-1 py-[0.125rem] text-xs ${
        canEditVariants
          ? "cursor-pointer hover:bg-setta-200/30 dark:hover:bg-setta-700/50"
          : "cursor-not-allowed opacity-60"
      } ${isCurr ? "bg-blue-500 dark:bg-blue-700" : ""}`}
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
            if (!canEditVariants) {
              return;
            }
            e.stopPropagation(); // so that you can click on it without clicking on the variant
            dispatchOptimisticProjectStateUpdate({
              apply: (state) => {
                getSectionCore(state, sectionId).defaultVariant = id;
              },
              send: (frontendOpId) =>
                route_set_default_section_variant({
                  projectConfigId: getCurrProjectConfigId(),
                  sectionId,
                  variantId: id,
                  frontendOpId,
                }),
            });
          }}
          disabled={!canEditVariants}
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
            if (!canEditVariants) {
              return;
            }
            e.stopPropagation(); // so that you can click on it without clicking on the variant
            dispatchOptimisticProjectStateUpdate({
              apply: (state) => {
                const variant = getSectionVariant(state, id);
                variant.isFrozen = !variant.isFrozen;
              },
              send: (frontendOpId) =>
                route_toggle_variant_frozen({
                  projectConfigId: getCurrProjectConfigId(),
                  variantId: id,
                  frontendOpId,
                }),
            });
          }}
          disabled={!canEditVariants}
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
              if (!canEditVariants) {
                return;
              }
              e.stopPropagation(); // so that you can click on it without clicking on the variant
              dispatchOptimisticProjectStateUpdate({
                apply: (state) => {
                  const { impl } = getVariantBaseAndEffectiveSectionImpl(
                    state,
                    getSectionCore(state, sectionId),
                    id,
                  );
                  if (!isBaseDictSectionImpl(impl)) {
                    return;
                  }
                  const nextIsJsonSource = !impl.isJsonSource;
                  const nextConfigLanguage = nextIsJsonSource
                    ? ConfigLanguageEnum.json
                    : ConfigLanguageEnum.python;
                  setCurrEffectiveSectionImplValue<"BaseDictSection">(
                    state,
                    sectionId,
                    {
                      isJsonSource: nextIsJsonSource,
                      configLanguage: nextConfigLanguage,
                    },
                  );
                },
                send: (frontendOpId) =>
                  route_toggle_variant_json_source({
                    projectConfigId: getCurrProjectConfigId(),
                    sectionId,
                    variantId: id,
                    frontendOpId,
                  }),
              });
            }}
            disabled={!canEditVariants}
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
  canEditVariants,
  allowVariantDeletion,
}: {
  sectionId: string;
  id: string;
  deletable: boolean;
  canEditVariants: boolean;
  allowVariantDeletion: boolean;
}) {
  const name = useProjectState((x) => getSectionVariant(x, id).name);

  function onSetName(v: string) {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        getSectionVariant(state, id).name = v;
      },
      send: (frontendOpId) =>
        route_set_section_variant_name({
          projectConfigId: getCurrProjectConfigId(),
          variantId: id,
          name: v,
          frontendOpId,
        }),
    });
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
    if (!allowVariantDeletion) {
      return;
    }
    const res = await route_delete_section_variant_or_ask({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      variantId: id,
    });
    if (res200(res) && res.data) {
      openDeleteJSONSourceFileModal({
        sectionId,
        variantId: id,
        filepath: res.data,
      });
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
        disabled={!canEditVariants}
      />

      {deletable && allowVariantDeletion && (
        <button
          className={
            "cursor-pointer bg-transparent text-transparent hover:!text-red-500 active:!text-red-700 group-hover/versionitem:text-setta-400/50"
          }
          onClick={onClickDelete}
          disabled={!allowVariantDeletion}
        >
          <i className="gg-trash" />
        </button>
      )}
    </li>
  );
}
