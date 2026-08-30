import type { NodeProps } from "@xyflow/react";
import { SectionContainer } from "../../section/container/SectionContainer";
import type { WorkspaceXyflowSectionNode } from "./types";

export function WorkspaceXyflowNode({
  data,
}: NodeProps<WorkspaceXyflowSectionNode>) {
  return <SectionContainer sectionId={data.sectionId} isTopLevel />;
}
