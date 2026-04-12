import { lazy, Suspense } from "react";
import { LoadingSpinner } from "./LoadingSpinner";

const LazyHomePage = lazy(async () => {
  const mod = await import("./Home/HomePage");
  return { default: mod.HomePage };
});

const LazyLauncherHomePage = lazy(async () => {
  const mod = await import("./Launcher/LauncherHomePage");
  return { default: mod.LauncherHomePage };
});

const LazyWorkspaceLaunchPage = lazy(async () => {
  const mod = await import("./Launch/WorkspaceLaunchPage");
  return { default: mod.WorkspaceLaunchPage };
});

const LazyShareStandaloneProjectSurfacePage = lazy(async () => {
  const mod = await import("./Project/ShareStandaloneProjectSurfacePage");
  return { default: mod.ShareStandaloneProjectSurfacePage };
});

export function HomeRouteSurface() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LazyHomePage />
    </Suspense>
  );
}

export function LauncherHomeRouteSurface() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LazyLauncherHomePage />
    </Suspense>
  );
}

export function WorkspaceLaunchRouteSurface() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LazyWorkspaceLaunchPage />
    </Suspense>
  );
}

export function ShareStandaloneProjectRouteSurface() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LazyShareStandaloneProjectSurfacePage />
    </Suspense>
  );
}
