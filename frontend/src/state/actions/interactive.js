import { useInteractive } from "state/definitions";

export function setInteractiveProjects(payload) {
  useInteractive.setState({ projects: new Set(payload) });
}

export function setCurrProjectIsInteractive(projectName) {
  useInteractive.setState((state) => ({
    currProjectIsInteractive: state.projects.has(projectName),
  }));
}

export function setInteractiveData(payload) {
  useInteractive.setState({ data: payload });
}
