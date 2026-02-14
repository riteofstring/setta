import { useState } from "react";
import { FileBrowserPane, type FileNode } from "./FileBrowserPane";
import { FileBrowserUniversalPreview } from "./FileBrowserUniversalPreview";

export function FileBrowserWorkspace({
  metaPaddingClassName,
  listInsetLeft,
}: {
  metaPaddingClassName: string;
  listInsetLeft: number;
}) {
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 pb-2">
      <div
        data-testid="file-browser-list-pane"
        className="min-h-[220px] min-w-0 flex-[1_1_58%]"
      >
        <FileBrowserPane
          metaPaddingClassName={metaPaddingClassName}
          listInsetLeft={listInsetLeft}
          onSelectionChange={setSelectedNode}
        />
      </div>
      <div
        data-testid="file-browser-preview-pane"
        className="min-h-[220px] min-w-0 flex-[1_1_42%] pr-2"
      >
        <FileBrowserUniversalPreview selectedNode={selectedNode} />
      </div>
    </div>
  );
}
