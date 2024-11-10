import CodeMirror from "@uiw/react-codemirror";
import { useCodeAreaHeight } from "components/Section/Layouts/CodeArea";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/utils/CodeMirror/useCodeMirrorStyle";
import _ from "lodash";
import React, { useEffect, useState } from "react";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSectionInfos } from "state/definitions";
import { useIsScrollable } from "state/hooks/sectionSizes";

export function MarkdownEditorInPane({ sectionId }) {
  return <MarkdownEditorCore sectionId={sectionId} />;
}

export function MarkdownEditorInSection({ sectionId }) {
  const { ref, isScrollable } = useIsScrollable();

  return (
    <MarkdownEditorCore
      containerClasses={`section-main ${isScrollable ? "nowheel" : ""} [&_.w-md-editor-text_*]:font-code flex flex-1 flex-col items-stretch overflow-y-auto rounded-lg mb-1.5  [&_.w-md-editor-bar]:hidden`}
      sectionId={sectionId}
      ref={ref}
    />
  );
}

const _MarkdownEditorCore = React.forwardRef(
  ({ sectionId, containerClasses, textAreaClasses }, ref) => {
    const { description, renderMarkdown } = useSectionInfos(
      (x) => _.pick(x.x[sectionId], ["description", "renderMarkdown"]),
      _.isEqual,
    );
    const [localDescription, setLocalDescription] = useState(description);

    const _TextAreaClasses = !textAreaClasses
      ? "block w-full flex-1 self-stretch rounded-lg bg-white p-2.5 font-mono text-xs text-setta-900 focus:outline-blue-500 focus:ring-blue-500 !outline-transparent !border-transparent dark:bg-setta-800 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500 dark:focus:ring-blue-500 resize-none"
      : textAreaClasses;

    const _ContainerClasses = !containerClasses
      ? "[&_.w-md-editor-text_*]:font-code flex flex-1 flex-col items-stretch overflow-y-auto rounded-2xl  [&_.w-md-editor-bar]:hidden"
      : containerClasses;

    useEffect(() => {
      if (description !== localDescription) {
        setLocalDescription(description);
      }
    }, [description]);

    function onChange(v) {
      setLocalDescription(v);
      debouncedSetDescription(sectionId, v, description);
    }

    const { wrapperRef, handleCreateEditor, maxHeight, overflow, nowheel } =
      useCodeAreaHeight({ sectionId });

    const theme = useCodeMirrorStyle();

    const extensions = getExtensions({
      sectionId,
      language: renderMarkdown ? "markdown" : null,
      tabToAutocomplete: true,
      escapeToBlur: true,
      indentWithTab: true,
    });

    return (
      <article
        ref={wrapperRef}
        className={`nodrag section-full-no-title cursor-auto [&_*]:!outline-0 ${overflow} ${nowheel}`}
      >
        <CodeMirror
          maxHeight={maxHeight}
          value={description}
          theme={theme}
          extensions={extensions}
          onChange={onChange}
          onCreateEditor={handleCreateEditor}
          indentWithTab={false} // I take care of this in getExtensions
        />
      </article>
    );
  },
);

const MarkdownEditorCore = React.memo(_MarkdownEditorCore);

function getFirstHeadingOrText(markdown) {
  // Adjusting the approach to capture the first 10 characters if no heading is found
  const regex = /^(?:\n)?(#+\s*)(.*?)(\n|$)/m;

  // Trim the markdown to remove leading whitespace
  const trimmedMarkdown = markdown.trimStart();

  // Apply the regex to the trimmed markdown
  const match = trimmedMarkdown.match(regex);

  let output = "";
  let returnHeading = false;

  // If a match is found and it's at the start of the string, return the heading text
  if (match && match.index === 0) {
    output = match[2].trim();
    returnHeading = true;
  } else {
    // If no heading is found at the start, find the first occurrence of a heading
    const headingMatch = trimmedMarkdown.match(/(#+\s*)(.*?)(\n|$)/);
    if (headingMatch) {
      // Return the first 10 characters before the first heading, or the entire text if it's shorter
      output = trimmedMarkdown
        .substring(0, Math.min(20, headingMatch.index))
        .trim();
    } else {
      // If no headings are found at all, return the first 10 characters of the markdown
      output = trimmedMarkdown.substring(0, 20).trim();
    }
  }

  if (output === "") {
    return null;
  } else if (!returnHeading) {
    return output + "...";
  }
  return output;
}

export function getDefaultInfoTitle() {
  return "Empty Info Section";
}

const debouncedSetDescription = _.debounce((sectionId, v, description) => {
  if (v !== description) {
    setSectionInfoAttr({ sectionId, attr: "description", value: v });
    const sectionName = getFirstHeadingOrText(v) ?? getDefaultInfoTitle();
    setSectionInfoAttr({ sectionId, attr: "name", value: sectionName });
    maybeIncrementProjectStateVersion(true);
  }
}, 200);
