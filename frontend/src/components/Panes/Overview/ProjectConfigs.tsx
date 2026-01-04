import * as Switch from "@radix-ui/react-switch";
import _ from "lodash";
import { Link } from "react-router-dom";
import { toggleProjectConfigPreviewEnabled } from "state/actions/localStorage";
import {
  useAllProjectMetadata,
  useLocalStorage,
  useProjectState,
} from "state/definitions";
import { PAGE_LOAD_TYPES, pathRelativeToProject } from "utils/constants";
import { ProjectConfig } from "utils/generatedTypes";

export function ProjectConfigs() {
  const currProjectConfigName = useProjectState((x) => x.projectConfig.name);
  const allProjectMetadata = useAllProjectMetadata(
    (x) => x.projectMetadata,
    _.isEqual,
  );
  const previewEnabled = useLocalStorage((x) => x.projectConfigPreviewEnabled);
  const toggleRootClasses =
    "items-center p-[0.2rem] w-7 min-w-7 h-2.5 bg-setta-400 dark:bg-setta-600 rounded-full relative inline-flex cursor-pointer [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus-visible:shadow-black data-[state='checked']:bg-blue-500 dark:data-[state='checked']:bg-blue-700 focus-visible:ring-2 disabled:pointer-events-none";
  const toggleThumbClasses =
    "block w-2.5 h-2.5 bg-white dark:bg-setta-800 rounded-full transition-all will-change-transform data-[state='checked']:translate-x-4 flex";

  return (
    <>
      <aside className="mb-2 flex items-center justify-between">
        <p className="text-xs text-setta-500">Toggle config previews.</p>
        <Switch.Root
          className={toggleRootClasses}
          checked={previewEnabled}
          onCheckedChange={toggleProjectConfigPreviewEnabled}
        >
          <Switch.Thumb className={toggleThumbClasses} />
        </Switch.Root>
      </aside>
      {/* 
      <p className="text-xs text-setta-600 dark:text-setta-300">
        Hover over an item to preview another version of your project
      </p> */}
      <section className=" flex h-full overflow-y-scroll rounded-lg border border-setta-200/50 p-1 dark:border-setta-850">
        <div
          className="mt-1 flex w-full flex-col gap-1"
          onMouseLeave={() => {
            onMouseLeave();
          }}
        >
          {allProjectMetadata.map((m, idx) => (
            <Link
              to={pathRelativeToProject(m.name)}
              key={idx}
              className="group flex min-w-full cursor-pointer flex-row items-center justify-between overflow-clip truncate rounded-md px-2 py-1 hover:bg-white/60 dark:hover:bg-setta-800/50"
              onMouseEnter={() => {
                onMouseEnter(m, currProjectConfigName, previewEnabled);
              }}
              state={{ pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG }}
            >
              <p
                className={`${m.name === currProjectConfigName ? "font-black !text-setta-900 dark:!text-setta-100" : ""} flex-shrink truncate text-xs text-setta-600 [transition:font-weight_100ms_ease-in-out]  group-hover:!text-setta-900 dark:text-setta-400 dark:group-hover:!text-setta-100`}
              >
                {m.name}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

function onMouseEnter(
  mousedOverProjectConfig: ProjectConfig,
  currProjectConfigName: string,
  previewEnabled: boolean,
) {
  // preview not enabled
  if (!previewEnabled) {
    return;
  }

  if (mousedOverProjectConfig.name !== currProjectConfigName) {
    useProjectState.setState((x) => {
      x.previewSectionVariantMap = _.cloneDeep(
        mousedOverProjectConfig.sectionVariantMap,
      );
    });
  } else {
    clearPreviewIds();
  }
}

function onMouseLeave() {
  clearPreviewIds();
}

function clearPreviewIds() {
  useProjectState.setState((x) => {
    x.previewSectionVariantMap = {};
  });
}
