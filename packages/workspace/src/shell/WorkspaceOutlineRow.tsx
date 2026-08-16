import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";
import { FaLayerGroup } from "react-icons/fa6";
import { RiArrowRightSLine, RiLock2Line, RiSubtractLine } from "react-icons/ri";
import {
  GROUP_SECTION_KIND,
  isGroupSection,
} from "../document/documentSelectors";
import { getRegisteredSectionKindOrThrow } from "../document/sectionKindRegistry";
import type { WorkspaceSection } from "../document/types";
import type {
  WorkspaceOutlineEntry,
  WorkspaceOutlineNode,
} from "./workspaceOutlineModel";

type OutlineRowStyle = CSSProperties & {
  "--setta-workspace-outline-depth": string;
  "--setta-workspace-outline-style-color": string;
};

type WorkspaceOutlineBranchProps = {
  activeSectionIds: ReadonlySet<string>;
  collapsedGroupIds: ReadonlySet<string>;
  effectiveFocusId: string | null;
  filterActive: boolean;
  node: WorkspaceOutlineNode;
  onClick: (event: MouseEvent<HTMLDivElement>, sectionId: string) => void;
  onContextMenu: (event: MouseEvent<HTMLDivElement>, sectionId: string) => void;
  onFocus: (sectionId: string) => void;
  onKeyDown: (
    event: KeyboardEvent<HTMLDivElement>,
    entry: WorkspaceOutlineEntry,
  ) => void;
  registerRow: (sectionId: string, element: HTMLDivElement | null) => void;
};

function getSectionStateDescription(section: WorkspaceSection): string {
  const states = [
    section.positionAndSizeLocked ? "locked" : null,
    section.isMinimized ? "minimized" : null,
    section.styleColor ? `style accent ${section.styleColor}` : null,
    section.tagColor ? `color tag ${section.tagColor}` : null,
  ].filter((state): state is string => state !== null);
  return states.length === 0 ? "" : `, ${states.join(", ")}`;
}

function WorkspaceOutlineKindIcon({ section }: { section: WorkspaceSection }) {
  if (section.kind === GROUP_SECTION_KIND) {
    return <FaLayerGroup />;
  }
  const RegisteredIcon = getRegisteredSectionKindOrThrow(section.kind).icon;
  return RegisteredIcon ? (
    <RegisteredIcon sectionId={section.id} />
  ) : (
    <i className="gg-menu" />
  );
}

function WorkspaceOutlineDisclosure({
  filterActive,
  isCollapsed,
  section,
}: {
  filterActive: boolean;
  isCollapsed: boolean;
  section: WorkspaceSection;
}) {
  const group = isGroupSection(section);
  return (
    <span
      aria-hidden="true"
      className="setta-workspace-outline-disclosure"
      data-expanded={group && !isCollapsed ? "true" : "false"}
      data-workspace-outline-disclosure={
        group && !filterActive ? "true" : undefined
      }
    >
      {group ? <RiArrowRightSLine focusable="false" /> : null}
    </span>
  );
}

function WorkspaceOutlineTagColor({ tagColor }: { tagColor: string | null }) {
  return (
    <span
      aria-hidden="true"
      className="setta-workspace-outline-tag-color"
      data-visible={tagColor ? "true" : "false"}
      style={{ backgroundColor: tagColor ?? "transparent" }}
      title={tagColor ? `Color tag: ${tagColor}` : undefined}
    />
  );
}

function WorkspaceOutlineStateIcons({
  section,
}: {
  section: WorkspaceSection;
}) {
  return (
    <>
      {section.positionAndSizeLocked ? (
        <span aria-hidden="true" className="setta-workspace-outline-state-icon">
          <RiLock2Line focusable="false" />
        </span>
      ) : null}
      {section.isMinimized ? (
        <span aria-hidden="true" className="setta-workspace-outline-state-icon">
          <RiSubtractLine focusable="false" />
        </span>
      ) : null}
      <span className="sr-only">{getSectionStateDescription(section)}</span>
    </>
  );
}

function getAriaExpanded(
  section: WorkspaceSection,
  isCollapsed: boolean,
): boolean | undefined {
  return isGroupSection(section) ? !isCollapsed : undefined;
}

function WorkspaceOutlineRow(
  props: WorkspaceOutlineBranchProps & { isCollapsed: boolean },
) {
  const { node } = props;
  const { section } = node;
  const rowStyle: OutlineRowStyle = {
    "--setta-workspace-outline-depth": `${node.depth * 12}px`,
    "--setta-workspace-outline-style-color":
      section.styleColor ?? "transparent",
  };

  return (
    <div
      aria-expanded={getAriaExpanded(section, props.isCollapsed)}
      aria-level={node.depth + 1}
      aria-posinset={node.positionInSet}
      aria-selected={props.activeSectionIds.has(section.id)}
      aria-setsize={node.setSize}
      className="setta-workspace-outline-item"
      data-workspace-outline-item={section.id}
      aria-keyshortcuts="Enter Space Shift+F10 ContextMenu"
      onClick={(event) => props.onClick(event, section.id)}
      onContextMenu={(event) => props.onContextMenu(event, section.id)}
      onFocus={() => props.onFocus(section.id)}
      onKeyDown={(event) => props.onKeyDown(event, node)}
      ref={(element) => props.registerRow(section.id, element)}
      role="treeitem"
      style={rowStyle}
      tabIndex={props.effectiveFocusId === section.id ? 0 : -1}
    >
      <div className="setta-workspace-outline-row">
        <WorkspaceOutlineDisclosure
          filterActive={props.filterActive}
          isCollapsed={props.isCollapsed}
          section={section}
        />
        <span aria-hidden="true" className="setta-workspace-outline-kind-icon">
          <WorkspaceOutlineKindIcon section={section} />
        </span>
        <WorkspaceOutlineTagColor tagColor={section.tagColor} />
        <span className="setta-workspace-outline-label">{section.name}</span>
        <WorkspaceOutlineStateIcons section={section} />
      </div>
    </div>
  );
}

function WorkspaceOutlineChildren(
  props: WorkspaceOutlineBranchProps & { isCollapsed: boolean },
) {
  if (props.isCollapsed || props.node.children.length === 0) {
    return null;
  }
  return (
    <div role="group">
      {props.node.children.map((child) => (
        <WorkspaceOutlineBranch
          {...props}
          key={child.section.id}
          node={child}
        />
      ))}
    </div>
  );
}

export function WorkspaceOutlineBranch(props: WorkspaceOutlineBranchProps) {
  const isCollapsed = props.collapsedGroupIds.has(props.node.section.id);
  return (
    <div role="none">
      <WorkspaceOutlineRow {...props} isCollapsed={isCollapsed} />
      <WorkspaceOutlineChildren {...props} isCollapsed={isCollapsed} />
    </div>
  );
}
