import * as Switch from "@radix-ui/react-switch";
import _ from "lodash";
import type { MouseEvent, PointerEvent } from "react";
import { Link } from "react-router-dom";
import { toggleProjectConfigPreviewEnabled } from "state/actions/localStorage";
import { loadShareProjectConfig } from "state/actions/share";
import {
  useAllProjectMetadata,
  useLocalStorage,
  useProjectState,
  useShareSession,
} from "state/definitions";
import {
  getPythonCodegenTarget,
  projectConfigHasPythonCodegen,
} from "utils/codegenTargets";
import { PAGE_LOAD_TYPES, pathRelativeToProject } from "utils/constants";
import { route_set_project_config_codegen_targets } from "utils/generatedEndpoints";
import {
  createProjectCodegenPythonTarget,
  ProjectCodegenLanguageEnum,
  ProjectConfig,
} from "utils/generatedTypes";

const TOGGLE_ROOT_CLASSES =
  "items-center p-[0.2rem] w-7 min-w-7 h-2.5 bg-setta-400 dark:bg-setta-600 rounded-full relative inline-flex cursor-pointer [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus-visible:shadow-black data-[state='checked']:bg-blue-500 dark:data-[state='checked']:bg-blue-700 focus-visible:ring-2 disabled:pointer-events-none";
const TOGGLE_THUMB_CLASSES =
  "block w-2.5 h-2.5 bg-white dark:bg-setta-800 rounded-full transition-all will-change-transform data-[state='checked']:translate-x-4 flex";

export function ProjectConfigs() {
  const isShareMode = useShareSession((x) => x.isShareMode);
  const currProjectConfigName = useProjectState((x) => x.projectConfig.name);
  const currProjectConfigId = useProjectState((x) => x.projectConfig.id);
  const allProjectMetadata = useAllProjectMetadata(
    (x) => x.projectMetadata,
    _.isEqual,
  );
  const previewEnabled = useLocalStorage((x) => x.projectConfigPreviewEnabled);

  return (
    <>
      <aside className="mb-2 flex items-center justify-between">
        <p className="text-xs text-setta-500">Toggle config previews.</p>
        <Switch.Root
          className={TOGGLE_ROOT_CLASSES}
          checked={previewEnabled}
          onCheckedChange={toggleProjectConfigPreviewEnabled}
        >
          <Switch.Thumb className={TOGGLE_THUMB_CLASSES} />
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
            <ProjectConfigRow
              key={idx}
              config={m}
              currProjectConfigId={currProjectConfigId}
              currProjectConfigName={currProjectConfigName}
              isShareMode={isShareMode}
              previewEnabled={previewEnabled}
            />
          ))}
        </div>
      </section>
    </>
  );
}

type ProjectConfigRowProps = {
  config: ProjectConfig;
  currProjectConfigId: string;
  currProjectConfigName: string;
  isShareMode: boolean;
  previewEnabled: boolean;
};

function ProjectConfigRow({
  config,
  currProjectConfigId,
  currProjectConfigName,
  isShareMode,
  previewEnabled,
}: ProjectConfigRowProps) {
  const isActive = config.name === currProjectConfigName;
  const pythonCodegenEnabled = projectConfigHasPythonCodegen(config);
  const sharedClasses =
    "group flex min-w-full cursor-pointer flex-row items-center justify-between overflow-clip truncate rounded-md px-2 py-1 hover:bg-white/60 dark:hover:bg-setta-800/50";

  const labelClassName = `${isActive ? "font-black !text-setta-900 dark:!text-setta-100" : ""} flex-shrink truncate text-xs text-setta-600 [transition:font-weight_100ms_ease-in-out]  group-hover:!text-setta-900 dark:text-setta-400 dark:group-hover:!text-setta-100`;
  const toggleLabelClassName = "text-[10px] text-setta-500 dark:text-setta-400";
  const currentPythonTarget = getPythonCodegenTarget(config);
  const nonPythonTargets = config.codegenTargets.filter(
    (target) => target.language !== ProjectCodegenLanguageEnum.python,
  );

  function updateCodegenTargets(checked: boolean) {
    if (isShareMode) {
      return;
    }
    const nextTargets = checked
      ? [
          ...nonPythonTargets,
          currentPythonTarget ?? createProjectCodegenPythonTarget(),
        ]
      : nonPythonTargets;
    void route_set_project_config_codegen_targets({
      projectConfigId: config.id,
      codegenTargets: nextTargets,
    });
    useAllProjectMetadata.setState((state) => ({
      ...state,
      projectMetadata: state.projectMetadata.map((entry) =>
        entry.id === config.id
          ? { ...entry, codegenTargets: nextTargets }
          : entry,
      ),
    }));
    if (config.id === currProjectConfigId) {
      useProjectState.setState((state) => {
        state.projectConfig.codegenTargets = nextTargets;
      });
    }
  }

  function stopRowNavigation(event: MouseEvent | PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (isShareMode) {
    return (
      <button
        type="button"
        className={sharedClasses}
        onClick={() => {
          if (config.id === currProjectConfigId) {
            return;
          }
          void loadShareProjectConfig({
            projectConfigId: config.id,
          });
        }}
        onMouseEnter={() => {
          onMouseEnter(config, currProjectConfigName, previewEnabled);
        }}
      >
        <p className={labelClassName}>{config.name}</p>
        <div
          className="ml-2 flex items-center gap-1"
          onClick={stopRowNavigation}
          onPointerDown={stopRowNavigation}
        >
          <span className={toggleLabelClassName}>Python</span>
          <Switch.Root
            className={TOGGLE_ROOT_CLASSES}
            checked={pythonCodegenEnabled}
            disabled={isShareMode}
            onCheckedChange={updateCodegenTargets}
          >
            <Switch.Thumb className={TOGGLE_THUMB_CLASSES} />
          </Switch.Root>
        </div>
      </button>
    );
  }

  return (
    <Link
      to={pathRelativeToProject(config.name)}
      className={sharedClasses}
      onMouseEnter={() => {
        onMouseEnter(config, currProjectConfigName, previewEnabled);
      }}
      state={{ pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG }}
    >
      <p className={labelClassName}>{config.name}</p>
      <div
        className="ml-2 flex items-center gap-1"
        onClick={stopRowNavigation}
        onPointerDown={stopRowNavigation}
      >
        <span className={toggleLabelClassName}>Python</span>
        <Switch.Root
          className={TOGGLE_ROOT_CLASSES}
          checked={pythonCodegenEnabled}
          disabled={isShareMode}
          onCheckedChange={updateCodegenTargets}
        >
          <Switch.Thumb className={TOGGLE_THUMB_CLASSES} />
        </Switch.Root>
      </div>
    </Link>
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
