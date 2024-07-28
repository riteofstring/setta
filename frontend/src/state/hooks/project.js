import { router } from "components/Pages/router";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { dbSetProjectConfigName } from "requests/projectName";
import {
  dbGetAllProjectConfigMetadata,
  dbLoadFullProject,
} from "requests/projects";
import {
  loadFullProject,
  loadProjectConfigState,
  resetProjectConfigState,
} from "state/actions/project/loadProject";
import { getProjectData } from "state/actions/project/saveProject";
import { useProjectConfig } from "state/definitions";
import { PAGE_LOAD_TYPES } from "utils/constants";
import { useEditableOnSubmit } from "./editableText";

export function useGetAllProjectConfigMetadata() {
  const [projects, setProjects] = useState([]);
  async function getAllProjectConfigMetadata() {
    const res = await dbGetAllProjectConfigMetadata();
    if (res.status === 200) {
      setProjects(res.data);
    }
  }
  return { projects, getAllProjectConfigMetadata };
}

export function useGetAllProjectConfigMetadataForFileMenu(open) {
  const { projects, getAllProjectConfigMetadata } =
    useGetAllProjectConfigMetadata();

  useEffect(() => {
    if (open) {
      getAllProjectConfigMetadata();
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

export function useLoadFullProject() {
  const [doneLoading, setDoneLoading] = useState(false);

  useEffect(() => {
    async function loadAllProjectData() {
      const res = await loadFullProject();
      setDoneLoading(res);
    }

    loadAllProjectData();
  }, []);

  return doneLoading;
}

export function useLoadProjectConfig() {
  const { projectConfigName } = useParams();
  const [doneLoading, setDoneLoading] = useState(false);

  useEffect(() => {
    loadProjectConfigState(projectConfigName);
    setDoneLoading(true);
  }, []);

  return doneLoading;
}

export function useEditableProjectName() {
  const name = useProjectConfig((x) => x.name);
  async function condition(v) {
    const res = await dbSetProjectConfigName(v);
    return res.status === 200;
  }
  async function onSetName(v) {
    router.navigate(v, {
      state: { pageLoadType: PAGE_LOAD_TYPES.CHANGE_PROJECT_CONFIG_NAME },
    });
  }

  return useEditableOnSubmit(name, onSetName, condition);
}

export function useResetProjectState() {
  const { pathname } = useLocation();
  // useEffect(() => {
  //   if (state?.pageLoadType === PAGE_LOAD_TYPES.CHANGE_PROJECT_CONFIG_NAME) {
  //     return;
  //   }
  //   resetProjectStores();
  // }, [pathname]);
  useEffect(() => {
    resetProjectConfigState();
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
