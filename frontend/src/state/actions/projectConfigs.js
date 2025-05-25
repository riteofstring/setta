export function getCurrentProjectConfig(_state) {
  const state = _state ?? useProjectState.getState();
  return state.projectConfigs[state.projectConfigId];
}

export function getCurrentSectionConfigs(_state) {
  return getCurrentProjectConfig(_state).sectionConfigs;
}
