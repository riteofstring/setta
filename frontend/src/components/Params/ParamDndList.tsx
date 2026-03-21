import type { ParamListKey } from "forks/dnd-kit/paramDndState";
import _ from "lodash";
import React from "react";
import { useMisc, useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { ParamDndProvider } from "./ParamDndContext";
import { useParamDndVisibleChildrenByParent } from "./ParamDndContext";
import { ParamDuplicateIndexProvider } from "./ParamDuplicateIndexContext";
import { ParamSwitch } from "./ParamSwitch";
import {
  getParamDndListRenderEntries,
  getParamDndListRenderModel,
} from "./getParamDndListRenderModel";

type ParamDndListProps = {
  sectionId: string;
  paramIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
  onResizeStart: React.MouseEventHandler;
  listKey: ParamListKey;
  hasSectionStyleTheme: boolean;
  showResizeHandle?: boolean;
};

function ParamDndListRows({
  sectionId,
  onResizeStart,
  listKey,
  hasSectionStyleTheme,
  renderEntries,
  showResizeHandle = true,
}: Pick<
  ParamDndListProps,
  | "sectionId"
  | "onResizeStart"
  | "listKey"
  | "hasSectionStyleTheme"
  | "showResizeHandle"
> & {
  renderEntries: Array<{
    paramId: string;
    isTopLevelWithPad: boolean;
    isNestedChildInTree: boolean;
  }>;
}) {
  return renderEntries.map((entry) => (
    <ParamSwitch
      key={entry.paramId}
      sectionId={sectionId}
      paramInfoId={entry.paramId}
      onResizeStart={onResizeStart}
      isTopLevelWithPad={entry.isTopLevelWithPad}
      isNestedChildInTree={entry.isNestedChildInTree}
      listKey={listKey}
      hasSectionStyleTheme={hasSectionStyleTheme}
      showResizeHandle={showResizeHandle}
    />
  ));
}

export function ParamDndList({
  sectionId,
  paramIds,
  requiredParamIdsToPaths,
  onResizeStart,
  listKey,
  hasSectionStyleTheme,
  showResizeHandle = true,
}: ParamDndListProps) {
  const isSelectingParams = useMisc((x) => x.isSelectingParams);
  const { canEditStructure } = useShareCapabilities();
  const allowTree = isSelectingParams && canEditStructure;
  const {
    duplicateIndex,
    nestedParentParamIdLookup,
    paramFilterActive,
    renderTree,
    tree,
    visibleParamIdLookup,
  } = useProjectState(
    (state) =>
      getParamDndListRenderModel({
        state,
        sectionId,
        paramIds,
        requiredParamIdsToPaths,
        allowTree,
      }),
    _.isEqual,
  );
  const enabled = allowTree && !paramFilterActive;
  const visibleChildrenByParent = useParamDndVisibleChildrenByParent(
    renderTree?.visibleChildrenByParent ?? null,
  );
  const renderEntries = React.useMemo(() => {
    if (!renderTree || !visibleChildrenByParent) {
      return null;
    }
    return getParamDndListRenderEntries({
      rootId: renderTree.rootId,
      visibleChildrenByParent,
      requiredParamIdsToPaths,
      nestedParentParamIdLookup,
      visibleParamIdLookup,
    });
  }, [
    renderTree,
    visibleChildrenByParent,
    requiredParamIdsToPaths,
    nestedParentParamIdLookup,
    visibleParamIdLookup,
  ]);

  if (!tree || !renderEntries) {
    return (
      <ParamDuplicateIndexProvider value={duplicateIndex}>
        {paramIds.length > 0 ? (
          <ParamDndListRows
            sectionId={sectionId}
            onResizeStart={onResizeStart}
            listKey={listKey}
            hasSectionStyleTheme={hasSectionStyleTheme}
            renderEntries={renderEntries ?? []}
            showResizeHandle={showResizeHandle}
          />
        ) : null}
      </ParamDuplicateIndexProvider>
    );
  }

  return (
    <ParamDuplicateIndexProvider value={duplicateIndex}>
      <ParamDndProvider
        sectionId={sectionId}
        listKey={listKey}
        tree={tree}
        enabled={enabled}
      >
        <ParamDndListRows
          sectionId={sectionId}
          onResizeStart={onResizeStart}
          listKey={listKey}
          hasSectionStyleTheme={hasSectionStyleTheme}
          renderEntries={renderEntries}
          showResizeHandle={showResizeHandle}
        />
      </ParamDndProvider>
    </ParamDuplicateIndexProvider>
  );
}
