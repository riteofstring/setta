import { lazy, Suspense } from "react";
import { LoadingSpinner } from "../LoadingSpinner";

const LazyMainContainer = lazy(async () => {
  const mod = await import("./MainContainer");
  return { default: mod.MainContainer };
});

const LazyStandaloneProjectSurfacePage = lazy(async () => {
  const mod = await import("./StandaloneProjectSurfacePage");
  return { default: mod.StandaloneProjectSurfacePage };
});

const LazyShareMainContainer = lazy(async () => {
  const mod = await import("../Share/ShareMainContainer");
  return { default: mod.ShareMainContainer };
});

type ShareProjectRouteSurfaceProps = {
  doneLoading: boolean;
  is404: boolean;
};

export function ProjectRouteSurface() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LazyMainContainer />
    </Suspense>
  );
}

export function StandaloneProjectRouteSurface() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LazyStandaloneProjectSurfacePage />
    </Suspense>
  );
}

export function ShareProjectRouteSurface({
  doneLoading,
  is404,
}: ShareProjectRouteSurfaceProps) {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LazyShareMainContainer doneLoading={doneLoading} is404={is404} />
    </Suspense>
  );
}
