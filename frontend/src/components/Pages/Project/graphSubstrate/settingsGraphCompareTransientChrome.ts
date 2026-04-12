export type SettingsGraphCompareTransientChromeSnapshot = {
  graphSurfaceMounted: boolean;
  headerNotificationVisible: boolean;
  projectIsLoading: boolean;
  settingsContentMounted: boolean;
};

export function isSettingsGraphCompareTransientChromeSettled(
  snapshot: SettingsGraphCompareTransientChromeSnapshot,
): boolean {
  return (
    snapshot.graphSurfaceMounted &&
    !snapshot.headerNotificationVisible &&
    snapshot.settingsContentMounted
  );
}
