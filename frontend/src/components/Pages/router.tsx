import type { CreateModeWrappedBrowserRouterArgs } from "./modeWrappedBrowserRouter";
import { createModeWrappedBrowserRouter } from "./modeWrappedBrowserRouter";
import { buildModeWrappedRouterArgs } from "./modeWrappedRouterArgs";

export type CreateAppRouterArgs = Pick<
  CreateModeWrappedBrowserRouterArgs,
  "renderDictArea"
>;

export function createAppRouter({ renderDictArea }: CreateAppRouterArgs) {
  return createModeWrappedBrowserRouter({
    ...buildModeWrappedRouterArgs(),
    renderDictArea,
  });
}
