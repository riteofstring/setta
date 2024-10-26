import { router } from "components/Pages/router";
import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { dbSetProjectConfigName } from "requests/projectName";
import {
  dbGetAllProjectConfigMetadata,
  dbGetDefaultConfigName,
  dbLoadFullProject,
  dbLoadProjectConfigNames,
} from "requests/projects";
import {
  loadProjectConfig,
  loadSettingsProjectConfig,
} from "state/actions/project/loadProject";
import { setProjectConfigName } from "state/actions/project/projectConfig";
import { getProjectData } from "state/actions/project/saveProject";
import {
  useAllProjectConfigs,
  useMisc,
  useProjectConfig,
} from "state/definitions";
import { PAGE_LOAD_TYPES, SETTINGS_PROJECT_NAME } from "utils/constants";
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
    const { project, ...theRest } = getProjectData({
      withArtifactMetadata: true,
    });
    setProjectJson(theRest);
  }
  async function exportFullProjectJson() {
    const res = await dbLoadFullProject({});
    if (res.status === 200) {
      setProjectJson(res.data);
    }
  }

  return { projectJson, exportProjectJson, exportFullProjectJson };
}

export function useLoadProjectConfig() {
  const { projectConfigName } = useParams();
  const { state } = useLocation();
  const pageLoadType = state?.pageLoadType;
  const [doneLoading, setDoneLoading] = useState(false);
  const prevProjectConfigName = useRef(projectConfigName);

  console.log("projectConfigName", projectConfigName);

  async function loadFn() {
    setDoneLoading(false);
    const res = await loadProjectConfig({ projectConfigName });
    setDoneLoading(res);
    useMisc.setState({ projectIsLoading: false });
  }

  async function loadSettingsProject() {
    setDoneLoading(false);
    const res = await loadSettingsProjectConfig();
    setDoneLoading(res);
    useMisc.setState({ projectIsLoading: false });
  }

  useEffect(() => {
    if (pageLoadType === PAGE_LOAD_TYPES.CHANGE_PROJECT_CONFIG_NAME) {
      setProjectConfigName(projectConfigName);
      useMisc.setState({ projectIsLoading: false });
      return;
    }

    if (useMisc.getState().projectIsLoading) {
      return;
    }

    if (projectConfigName !== prevProjectConfigName.current) {
      prevProjectConfigName.current = projectConfigName;
    } else if (doneLoading) {
      console.log("doneLoading!!!!!!!!!!");
      useMisc.setState({ projectIsLoading: false });
      return;
    }

    useMisc.setState({ projectIsLoading: true });

    if (projectConfigName === SETTINGS_PROJECT_NAME) {
      loadSettingsProject();
      return;
    }
    // The first if-statement triggers for a page refresh or navigating to a different project
    if (pageLoadType === PAGE_LOAD_TYPES.LOAD_PROJECT_CONFIG) {
      loadFn();
    }
  }, [pageLoadType, projectConfigName]);

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

export function useConfigAddress({ project, configId }) {
  const configName = project.configs.find((x) => x.id === configId).name;
  return `${project.name}/${configName}`;
}

export function useLoadFullProject(previewEnabled) {
  const [doneLoading, setDoneLoading] = useState(false);
  const { projectConfigName: currProjectConfigName } = useParams();

  async function fullLoadFn() {
    setDoneLoading(false);
    const fullProjectRes = await dbLoadFullProject({
      excludeProjectConfigName: currProjectConfigName,
    });
    const nameRes = await dbLoadProjectConfigNames();
    if (fullProjectRes.status === 200 && nameRes.status === 200) {
      const nameToConfig = {};
      for (const p of fullProjectRes.data) {
        nameToConfig[p.projectConfig.name] = p;
      }
      useAllProjectConfigs.setState({
        x: nameToConfig,
        names: nameRes.data,
      });
      setDoneLoading(true);
    }
  }

  async function nameOnlyLoadFn() {
    setDoneLoading(false);
    const res = await dbLoadProjectConfigNames();
    if (res.status === 200) {
      useAllProjectConfigs.setState({
        x: {},
        names: res.data,
      });
      setDoneLoading(true);
    }
  }

  useEffect(() => {
    if (previewEnabled) {
      fullLoadFn();
    } else {
      nameOnlyLoadFn();
    }
  }, [previewEnabled, currProjectConfigName]);

  return { doneLoading, currProjectConfigName };
}

export function useDefaultConfigName() {
  const [defaultConfigName, setDefaultConfigName] = useState(null);

  async function fn() {
    const res = await dbGetDefaultConfigName();
    if (res.status === 200) {
      setDefaultConfigName(res.data);
    }
  }

  useEffect(() => {
    fn();
  }, []);

  return defaultConfigName;
}
