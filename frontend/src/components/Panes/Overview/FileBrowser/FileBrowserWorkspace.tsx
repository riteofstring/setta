import { useState } from "react";
import { FileBrowserPane, type FileNode } from "./FileBrowserPane";
import { FileBrowserSpreadsheetEditor } from "./FileBrowserSpreadsheetEditor";

export function FileBrowserWorkspace({
  metaPaddingClassName,
  listInsetLeft,
}: {
  metaPaddingClassName: string;
  listInsetLeft: number;
}) {
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const selectedFile =
    selectedNode && selectedNode.type === "file"
      ? {
          name: selectedNode.name,
          fullPath: selectedNode.fullPath,
        }
      : null;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 pb-2 lg:flex-row lg:pb-0">
      <div className="min-h-[220px] min-w-0 flex-1 lg:basis-[46%]">
        <FileBrowserPane
          metaPaddingClassName={metaPaddingClassName}
          listInsetLeft={listInsetLeft}
          onSelectionChange={setSelectedNode}
        />
      </div>
      <div className="min-h-[220px] min-w-0 flex-1 pr-2">
        <FileBrowserSpreadsheetEditor selectedFile={selectedFile} />
      </div>
    </div>
  );
}
