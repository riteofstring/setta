import type { NodeProps } from "@xyflow/react";
import { useWorkspaceDocument } from "../../document/stores.js";
import { SectionContainer } from "../../section/container/SectionContainer.js";
import type { WorkspaceXyflowSectionNode } from "./types.js";

export function WorkspaceXyflowNode({
  data,
}: NodeProps<WorkspaceXyflowSectionNode>) {
  const sectionExists = useWorkspaceDocument((state) =>
    Object.hasOwn(state.sections, data.sectionId),
  );
  if (!sectionExists) {
    return null;
  }
  return <SectionContainer sectionId={data.sectionId} isTopLevel />;
}
