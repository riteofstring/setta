import {
  SortableListProvider,
  useSortableListItem,
} from "components/Pages/Project/ViewModeDnd";
import _ from "lodash";
import {
  createNewSectionVariant,
  setDefaultSectionVariant,
  setSectionVariant,
  setSectionVariantName,
  setSectionVariantSortOrder,
  toggleVariantFrozen,
  toggleVariantJsonSource,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { useState } from "react";
import { FaRegSnowflake } from "react-icons/fa";
import { FiFileText, FiPlus } from "react-icons/fi";
import { HiHome } from "react-icons/hi";
import { RxDragHandleDots2 } from "react-icons/rx";
import { openDeleteJSONSourceFileModal } from "state/actions/modal";
import { deleteSectionVariantOrAsk } from "state/actions/project/sectionVariants";
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
    callOpenAPI(
      createNewSectionVariant({
        body: {
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
        },
      } as Parameters<typeof createNewSectionVariant>[0]),
    );
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
            <FiPlus size={13} />
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
        className="section-full nodrag nowheel grid auto-rows-min grid-cols-subgrid gap-y-0 overflow-y-auto overflow-x-clip pt-6"
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
  const sortableEnabled = canEditVariants && variantIds.length > 1;
  function onReorderVariants(nextOrderedIds: Array<string>) {
    if (!canEditVariants) {
      return;
    }
    if (
      nextOrderedIds.length !== variantIds.length ||
      nextOrderedIds.every((id, idx) => id === variantIds[idx])
    ) {
      return;
    }
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        const section = getSectionCore(state, sectionId);
        section.variants = [...nextOrderedIds];
      },
      send: (frontendOpId) =>
        callOpenAPI(
          setSectionVariantSortOrder({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              sectionId,
              orderedVariantIds: nextOrderedIds,
              frontendOpId,
            },
          } as Parameters<typeof setSectionVariantSortOrder>[0]),
        ),
    });
  }
  return (
    <SortableListProvider
      id={`variant-list-sortable-${sectionId}`}
      items={variantIds}
      direction="vertical"
      enabled={sortableEnabled}
      onReorder={onReorderVariants}
    >
      {isEditing
        ? variantIds.map((variantId) => (
            <OneVariantEditing
              key={variantId}
              sectionId={sectionId}
              id={variantId}
              deletable={variantIds.length > 1}
              canEditVariants={canEditVariants}
              allowVariantDeletion={allowVariantDeletion}
              sortableEnabled={sortableEnabled}
            />
          ))
        : variantIds.map((variantId) => (
            <OneVariant
              key={variantId}
              sectionId={sectionId}
              id={variantId}
              isCurr={currVariantId === variantId}
              isDefault={variantId === defaultVariantId}
              canEditVariants={canEditVariants}
              sortableEnabled={sortableEnabled}
            />
          ))}
    </SortableListProvider>
  );
}
function OneVariant({
  sortableEnabled,
  ...props
}: {
  sectionId: string;
  id: string;
  isCurr: boolean;
  isDefault: boolean;
  canEditVariants: boolean;
  sortableEnabled: boolean;
}) {
  if (!sortableEnabled) {
    return <OneVariantContent {...props} sortable={null} />;
  }
  return <OneVariantSortable {...props} sortableEnabled />;
}
function OneVariantSortable({
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
  sortableEnabled: boolean;
}) {
  const sortable = useSortableListItem(id, false, "vertical");
  return (
    <OneVariantContent
      sectionId={sectionId}
      id={id}
      isCurr={isCurr}
      isDefault={isDefault}
      canEditVariants={canEditVariants}
      sortable={sortable}
    />
  );
}
type VariantSortableItem = ReturnType<typeof useSortableListItem>;
function OneVariantContent({
  sectionId,
  id,
  isCurr,
  isDefault,
  canEditVariants,
  sortable,
}: {
  sectionId: string;
  id: string;
  isCurr: boolean;
  isDefault: boolean;
  canEditVariants: boolean;
  sortable: VariantSortableItem | null;
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
  const rowClasses = `section-key-value group/versionitem flex h-8 w-full min-w-0 items-center gap-2 rounded px-2 text-xs transition-colors ${canEditVariants ? "cursor-pointer" : "cursor-not-allowed opacity-60"} ${
    isCurr
      ? "bg-white text-blue-600 shadow-sm dark:bg-setta-800"
      : "text-setta-700 hover:bg-setta-100 dark:text-setta-300 dark:hover:bg-setta-800/50"
  }`;
  const dragHandleClasses = sortable
    ? "inline-flex h-full w-4 shrink-0 cursor-grab items-center justify-center text-setta-400 active:cursor-grabbing dark:text-setta-500"
    : "inline-flex h-full w-4 shrink-0 cursor-default items-center justify-center text-setta-400 opacity-60 dark:text-setta-600";
  const labelClassName = `section-key min-w-0 flex-1 truncate text-left ${
    isCurr
      ? "font-medium text-blue-600 dark:text-blue-300"
      : "text-setta-500 dark:text-setta-300"
  }`;
  const stopDragPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation();
  };
  return (
    <li
      ref={sortable?.setNodeRef}
      data-testid="section-variant-row"
      data-variant-id={id}
      style={sortable?.style}
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
                  callOpenAPI(
                    setSectionVariant({
                      body: {
                        projectConfigId: getCurrProjectConfigId(),
                        sectionId,
                        variantId: id,
                        frontendOpId,
                      },
                    } as Parameters<typeof setSectionVariant>[0]),
                  ),
              })
          : undefined
      }
      aria-disabled={!canEditVariants}
      className={rowClasses}
    >
      <span
        ref={sortable?.setActivatorNodeRef}
        data-testid="section-variant-drag-handle"
        className={`${dragHandleClasses} touch-none`}
        {...(sortable ? sortable.attributes : {})}
        {...(sortable ? sortable.listeners : {})}
        onClick={(event) => event.stopPropagation()}
      >
        <RxDragHandleDots2 className="h-3.5 w-3.5 shrink-0" />
      </span>
      <p className={labelClassName}>{name}</p>
      <div className="flex shrink-0 items-center gap-2">
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
                callOpenAPI(
                  setDefaultSectionVariant({
                    body: {
                      projectConfigId: getCurrProjectConfigId(),
                      sectionId,
                      variantId: id,
                      frontendOpId,
                    },
                  } as Parameters<typeof setDefaultSectionVariant>[0]),
                ),
            });
          }}
          onPointerDown={stopDragPointerDown}
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
                callOpenAPI(
                  toggleVariantFrozen({
                    body: {
                      projectConfigId: getCurrProjectConfigId(),
                      variantId: id,
                      frontendOpId,
                    },
                  } as Parameters<typeof toggleVariantFrozen>[0]),
                ),
            });
          }}
          onPointerDown={stopDragPointerDown}
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
                  callOpenAPI(
                    toggleVariantJsonSource({
                      body: {
                        projectConfigId: getCurrProjectConfigId(),
                        sectionId,
                        variantId: id,
                        frontendOpId,
                      },
                    } as Parameters<typeof toggleVariantJsonSource>[0]),
                  ),
              });
            }}
            onPointerDown={stopDragPointerDown}
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
  sortableEnabled,
  ...props
}: {
  sectionId: string;
  id: string;
  deletable: boolean;
  canEditVariants: boolean;
  allowVariantDeletion: boolean;
  sortableEnabled: boolean;
}) {
  if (!sortableEnabled) {
    return <OneVariantEditingContent {...props} sortable={null} />;
  }
  return <OneVariantEditingSortable {...props} sortableEnabled />;
}
function OneVariantEditingSortable({
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
  sortableEnabled: boolean;
}) {
  const sortable = useSortableListItem(id, false, "vertical");
  return (
    <OneVariantEditingContent
      sectionId={sectionId}
      id={id}
      deletable={deletable}
      canEditVariants={canEditVariants}
      allowVariantDeletion={allowVariantDeletion}
      sortable={sortable}
    />
  );
}
function OneVariantEditingContent({
  sectionId,
  id,
  deletable,
  canEditVariants,
  allowVariantDeletion,
  sortable,
}: {
  sectionId: string;
  id: string;
  deletable: boolean;
  canEditVariants: boolean;
  allowVariantDeletion: boolean;
  sortable: VariantSortableItem | null;
}) {
  const name = useProjectState((x) => getSectionVariant(x, id).name);
  function onSetName(v: string) {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        getSectionVariant(state, id).name = v;
      },
      send: (frontendOpId) =>
        callOpenAPI(
          setSectionVariantName({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              variantId: id,
              name: v,
              frontendOpId,
            },
          } as Parameters<typeof setSectionVariantName>[0]),
        ),
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
  const stopDragPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation();
  };
  async function onClickDelete(e) {
    e.stopPropagation();
    if (!allowVariantDeletion) {
      return;
    }
    const filepath = await deleteSectionVariantOrAsk({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      variantId: id,
    });
    if (filepath) {
      openDeleteJSONSourceFileModal({
        sectionId,
        variantId: id,
        filepath,
      });
    }
  }
  return (
    <li
      ref={sortable?.setNodeRef}
      data-testid="section-variant-edit-row"
      data-variant-id={id}
      style={sortable?.style}
      className="section-key-value group/versionitem flex h-8 cursor-pointer items-center gap-2 rounded border border-setta-200 px-2 text-xs transition-colors focus-within:!border-blue-500 hover:border-setta-500/70 dark:border-setta-700 dark:hover:border-setta-500/70"
    >
      <span
        ref={sortable?.setActivatorNodeRef}
        data-testid="section-variant-edit-drag-handle"
        className={
          sortable
            ? "inline-flex h-full w-4 shrink-0 cursor-grab touch-none items-center justify-center text-setta-400 active:cursor-grabbing dark:text-setta-500"
            : "inline-flex h-full w-4 shrink-0 cursor-default touch-none items-center justify-center text-setta-400 opacity-60 dark:text-setta-600"
        }
        {...(sortable ? sortable.attributes : {})}
        {...(sortable ? sortable.listeners : {})}
        onClick={(event) => event.stopPropagation()}
      >
        <RxDragHandleDots2 className="h-3.5 w-3.5 shrink-0" />
      </span>
      <input
        value={inputValue}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onPointerDown={stopDragPointerDown}
        className="flex-1 truncate text-setta-500 focus:text-setta-900 focus:outline-none focus:ring-0 dark:text-setta-400 dark:focus:text-setta-200"
        disabled={!canEditVariants}
      />

      {deletable && allowVariantDeletion && (
        <button
          className={
            "cursor-pointer bg-transparent text-transparent hover:!text-red-500 active:!text-red-700 group-hover/versionitem:text-setta-400/50"
          }
          onClick={onClickDelete}
          onPointerDown={stopDragPointerDown}
          disabled={!allowVariantDeletion}
        >
          <i className="gg-trash" />
        </button>
      )}
    </li>
  );
}
