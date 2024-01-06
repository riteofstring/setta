// import { useSectionInfos } from "models/info/sectionInfos";
// import ReactMarkdown from "react-markdown";
// import remarkGfm from "remark-gfm";
// import { ScrollingArea } from "utils/atoms/scrollingarea/scrollingarea";
import { ResizableDescription } from "utils/Resizable/ResizableDescription";

export function VersionList({ sectionId }) {
  return (
    <ResizableDescription sectionId={sectionId}>
      <section className="version-section -my-4 flex-1 self-stretch pt-9 pb-8">
        <ul className="version-list nodrag nowheel overflow-y-auto overflow-x-clip pt-2">
          <Items active={true} />
          <Items />
          <Items />
        </ul>
      </section>
    </ResizableDescription>
  );
}

function Items({ active }) {
  return (
    <li className="version-list-item -my-1 -mx-2 cursor-pointer auto-rows-auto justify-between rounded-xl px-2 py-1 text-xs hover:bg-runcoder-50/50 dark:hover:bg-runcoder-800/50">
      <p
        className={`col-start-1 truncate ${
          active
            ? "font-medium text-runcoder-800 dark:text-runcoder-100"
            : "text-runcoder-400 dark:text-runcoder-400"
        } `}
      >
        dataset sklearn.make_blobs version 1abcde
      </p>
      <p className="col-start-2 italic text-runcoder-400 dark:text-runcoder-500">
        01/04/2024
      </p>
    </li>
  );
}
