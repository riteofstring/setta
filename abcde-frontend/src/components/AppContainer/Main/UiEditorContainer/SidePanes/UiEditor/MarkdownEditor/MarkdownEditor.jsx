import MDEditor from "@uiw/react-md-editor";
import {
  useGetSectionDescription,
  useSetSectionDescription,
} from "hooks/useSectionDescription";
import React from "react";

const _MarkdownEditor = React.forwardRef(({ sectionId }, ref) => {
  const description = useGetSectionDescription(sectionId, "value");
  const setDescription = useSetSectionDescription(sectionId);

  return (
    <div
      data-color-mode="light"
      className="flex flex-1 flex-col items-stretch overflow-y-auto rounded-2xl border border-solid border-slate-300 [&_.w-md-editor-bar]:hidden [&_.w-md-editor-text_*]:font-code"
    >
      <MDEditor
        value={description || ""}
        onChange={setDescription}
        preview="edit"
        textareaProps={{ resize: "none" }}
        className="flex-1 self-stretch"
      />
    </div>
  );
});

export const MarkdownEditor = React.memo(_MarkdownEditor);
