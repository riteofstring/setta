import {
  NEW_PROJECT,
  SAME_PROJECT_NEW_PROJECT_CONFIG,
  SAME_PROJECT_NEW_PROJECT_CONFIG_NAME,
  SAME_PROJECT_NEW_PROJECT_NAME,
  SWITCHING_CONFIG,
} from "components/Pages/pageLoadTypes";
import { router } from "components/Pages/router";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { dbSetProjectName } from "requests/projectName";
import {
  dbGetProjectConfigMetadatas,
  dbLoadFullProject,
} from "requests/projects";
import { setCurrProjectIsInteractive } from "state/actions/interactive";
import { loadProject } from "state/actions/project/loadProject";
import { setProjectConfigName } from "state/actions/project/projectConfig";
import { getProjectData } from "state/actions/project/saveProject";
import { useProjectConfig } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { useEditableOnSubmit } from "./editableText";

export function useGetProjectConfigMetadatas() {
  const [projects, setProjects] = useState([]);
  async function getProjectConfigMetadatas() {
    const res = await dbGetProjectConfigMetadatas();
    if (res.status === 200) {
      setProjects(res.data);
    }
  }
  return { projects, getProjectConfigMetadatas };
}

export function useGetProjectConfigMetadatasForFileMenu(open) {
  const { projects, getProjectConfigMetadatas } =
    useGetProjectConfigMetadatas();

  useEffect(() => {
    if (open) {
      getProjectConfigMetadatas();
    }
  }, [open]);

  return projects;
}

export function useExportProjectJson() {
  const [projectJson, setProjectJson] = useState({});
  function exportProjectJson() {
    const { project, ...theRest } = getProjectData();
    setProjectJson(theRest);
  }
  async function exportFullProjectJson() {
    const res = await dbLoadFullProject();
    if (res.status === 200) {
      setProjectJson(res.data);
    }
  }

  return { projectJson, exportProjectJson, exportFullProjectJson };
}

export function useLoadProject() {
  const { projectName } = useParams();
  const { state } = useLocation();
  const pageLoadType = state?.pageLoadType;
  const [doneLoading, setDoneLoading] = useState(false);

  useEffect(() => {
    async function loadAllProjectData() {
      setDoneLoading(false);
      const res = await loadProject({ projectName });
      setDoneLoading(res);
    }

    if (pageLoadType === SWITCHING_CONFIG) {
      return;
    }

    // The first if-statement triggers for a page refresh or navigating to a different project
    if (
      !doneLoading ||
      [NEW_PROJECT, SAME_PROJECT_NEW_PROJECT_CONFIG].includes(pageLoadType)
    ) {
      loadAllProjectData();
    } else if (pageLoadType === SAME_PROJECT_NEW_PROJECT_NAME) {
      setProjectConfigName(projectName);
    }

    setCurrProjectIsInteractive(projectName);
  }, [projectName]);

  return doneLoading;
}

export function useEditableProjectName() {
  const name = useProjectConfig((x) => x.name);
  async function condition(v) {
    const res = await dbSetProjectName(v);
    return res.status === 200;
  }
  async function onSetName(v) {
    router.navigate(v, {
      state: { pageLoadType: SAME_PROJECT_NEW_PROJECT_NAME },
    });
  }

  return useEditableOnSubmit(name, onSetName, condition);
}

export function useResetProjectState() {
  const { pathname, state } = useLocation();
  useEffect(() => {
    if (
      [
        SAME_PROJECT_NEW_PROJECT_NAME,
        SAME_PROJECT_NEW_PROJECT_CONFIG_NAME,
        SWITCHING_CONFIG,
      ].includes(state?.pageLoadType)
    ) {
      return;
    }
    resetProjectStores();
  }, [pathname]);
}

export function useConfigAddress({ project, configId }) {
  const configName = project.configs.find((x) => x.id === configId).name;
  return `${project.name}/${configName}`;
}

export function useDefaultConfigAddress(project) {
  const configId = project.defaultConfigId;
  return useConfigAddress({ project, configId });
}
