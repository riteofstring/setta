import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import React, { useCallback, useEffect, useState } from "react";
import { maybeIncrementProjectStateVersion } from "thunks/undo";

const _MarkdownEditor = React.forwardRef(({ sectionId }, ref) => {
  const description = useSectionInfos((x) => x.x[sectionId].description);
  const [localDescription, setLocalDescription] = useState(description);

  useEffect(() => {
    if (description !== localDescription) {
      setLocalDescription(description);
    }
  }, [description]);

  function onChange(v) {
    setLocalDescription(v);
    setDescription(v);
  }

  const setDescription = useCallback(
    _.debounce((v) => {
      if (v !== description) {
        useSectionInfos
          .getState()
          .setSectionInfoAttr({ sectionId, attr: "description", value: v });
        maybeIncrementProjectStateVersion(true);
      }
    }, 200),
    [description],
  );

  return (
    <div
      data-color-mode="light"
      className="[&_.w-md-editor-text_*]:font-code flex flex-1 flex-col items-stretch overflow-y-auto rounded-2xl border border-solid border-runcoder-300 dark:border-runcoder-600 [&_.w-md-editor-bar]:hidden"
    >
      <textarea
        value={localDescription}
        onChange={(v) => onChange(v.target.value)}
        className="block w-full flex-1 self-stretch rounded-lg bg-white p-2.5 font-mono text-sm text-runcoder-900 focus:border-blue-500 focus:ring-blue-500 dark:border-runcoder-700 dark:bg-runcoder-800 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500"
        placeholder="Write your description in Markdown..."
      />
    </div>
  );
});

export const MarkdownEditor = React.memo(_MarkdownEditor);
