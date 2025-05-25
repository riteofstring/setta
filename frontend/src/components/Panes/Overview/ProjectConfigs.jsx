import { Toggle } from "components/Utils/atoms/toggles/Toggle";
import _ from "lodash";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { maybeRunGuiToYamlOnAllSections } from "state/actions/guiToYaml";
import { toggleProjectConfigPreviewEnabled } from "state/actions/localStorage";
import { setAllPreviewVariantIdsToNull } from "state/actions/sectionInfos";
import {
  useLocalStorage,
  useProjectLoading,
  useProjectState,
} from "state/definitions";
import { PAGE_LOAD_TYPES, pathRelativeToProject } from "utils/constants";

export const ProjectConfigs = React.forwardRef(() => {
  const { projectConfigId, configNames } = useProjectState((x) => {
    const projectConfigId = x.projectConfigId;
    const configNames = _.map(x.projectConfigs, (p) => [p.id, p.name]);
    return { projectConfigId, configNames };
  }, _.isEqual);

  const projectIsLoading = useProjectLoading((x) => x.projectIsLoading);
  const previewEnabled = useLocalStorage((x) => x.projectConfigPreviewEnabled);
  const [mousedOverId, setMousedOverId] = useState(projectConfigId);

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
            setMousedOverId(projectConfigId);
            onMouseLeave();
          }}
        >
          {!projectIsLoading ? (
            configNames.map(([id, name], idx) => (
              <Link
                to={pathRelativeToProject(name)}
                key={idx}
                className="group flex min-w-full cursor-pointer flex-row items-center justify-between overflow-clip truncate rounded-md px-2 py-1 hover:bg-white/60 dark:hover:bg-setta-800/50"
                onMouseEnter={() => {
                  setMousedOverId(id);
                  onMouseEnter({
                    previewEnabled,
                    mousedOverId,
                  });
                }}
                state={{ pageLoadType: PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG }}
              >
                <p
                  className={`${(previewEnabled && mousedOverId === id) || (!previewEnabled && projectConfigId === id) ? "font-black !text-setta-900 dark:!text-setta-100" : ""} flex-shrink truncate text-xs text-setta-600 [transition:font-weight_100ms_ease-in-out]  group-hover:!text-setta-900 dark:text-setta-400 dark:group-hover:!text-setta-100`}
                >
                  {name}
                </p>
              </Link>
            ))
          ) : (
            <i className="gg-spinner self-center justify-self-end text-blue-500/70" />
          )}
        </div>
      </section>
    </>
  );
});

function onMouseEnter({ mousedOverId, previewEnabled }) {
  // preview not enabled
  if (!previewEnabled) {
    return;
  }

  useProjectState.setState((x) => {
    x.previewProjectConfigId = mousedOverId;
  });

  // if (mousedOverName !== currProjectConfigName) {
  //   useProjectState.setState((x) => {
  //     for (const [k, v] of Object.entries(x.sections)) {
  //       if (previewSectionConfigs[k]) {
  //         v.previewVariantId = previewSectionConfigs[k].variantId;
  //       } else {
  //         v.previewVariantId = null;
  //       }
  //     }
  //   });

  //   maybeRunGuiToYamlOnAllSections(true);
  // } else {
  //   setAllPreviewVariantIdsToNull();
  //   maybeRunGuiToYamlOnAllSections(false);
  // }
}

function onMouseLeave() {
  setAllPreviewVariantIdsToNull();
  maybeRunGuiToYamlOnAllSections(false);
}
