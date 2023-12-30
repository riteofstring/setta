import { useSetSectionDescription } from "hooks/useSectionDescription";
import { useSectionInfos } from "models/info/sectionInfos";
import React from "react";

const _MarkdownEditor = React.forwardRef(({ sectionId }, ref) => {
  const description = useSectionInfos((x) => x.x[sectionId].description);
  const setDescription = useSetSectionDescription(sectionId);
  // onChange={(v)=>setDescription(v.target.value)}

  return (
    <div
      data-color-mode="light"
      className="[&_.w-md-editor-text_*]:font-code flex flex-1 flex-col items-stretch overflow-y-auto rounded-2xl border border-solid border-slate-300 dark:border-runcoder-600 [&_.w-md-editor-bar]:hidden"
    >
      {/* <MDEditor
        value={description}
        onChange={setDescription}
        preview="edit"
        textareaProps={{ resize: "none" }}
        className="flex-1 self-stretch"
      /> */}
      <textarea
        value={description}
        onChange={(v) => setDescription(v.target.value)}
        className="block w-full flex-1 self-stretch rounded-lg bg-white p-2.5 font-mono text-sm text-runcoder-900 focus:border-blue-500 focus:ring-blue-500 dark:border-runcoder-700 dark:bg-runcoder-800 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
        placeholder="Write your description in Markdown..."
      />
    </div>
  );
});

export const MarkdownEditor = React.memo(_MarkdownEditor);
