import { Toggle } from "components/Utils/atoms/toggles/Toggle";
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
  const allProjectMetadata = useAllProjectMetadata((x) => x, _.isEqual);
  const previewEnabled = useLocalStorage((x) => x.projectConfigPreviewEnabled);

  return (
    <>
      <aside className="mb-2 flex items-center justify-between">
        <p className="text-xs text-setta-500">Toggle config previews.</p>
        <Toggle
          checked={previewEnabled}
          onCheckedChange={toggleProjectConfigPreviewEnabled}
          twThumbClasses="flex"
        />
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
          {allProjectMetadata.projectMetadata.map((m, idx) => (
            <Link
              to={pathRelativeToProject(m.name)}
              key={idx}
              className="group flex min-w-full cursor-pointer flex-row items-center justify-between overflow-clip truncate rounded-md px-2 py-1 hover:bg-white/60 dark:hover:bg-setta-800/50"
              onMouseEnter={() => {
                onMouseEnter(m, currProjectConfigName, previewEnabled);
              }}
              state={{ pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG }}
            >
              <p className="flex-shrink truncate text-xs text-setta-600 [transition:font-weight_100ms_ease-in-out]  group-hover:!text-setta-900 dark:text-setta-400 dark:group-hover:!text-setta-100">
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

    // maybeRunGuiToYamlOnAllSections(true);
  } else {
    clearPreviewIds();
    // maybeRunGuiToYamlOnAllSections(false);
  }
}

function onMouseLeave() {
  clearPreviewIds();
  // maybeRunGuiToYamlOnAllSections(false);
}

function clearPreviewIds() {
  useProjectState.setState((x) => {
    x.previewSectionVariantMap = {};
  });
}
