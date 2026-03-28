import type { CreateModeWrappedBrowserRouterArgs } from "./modeWrappedBrowserRouter";
import { createModeWrappedBrowserRouter } from "./modeWrappedBrowserRouter";

export type CreateAppRouterArgs = Pick<
  CreateModeWrappedBrowserRouterArgs,
  "renderDictArea"
>;

export function createAppRouter({ renderDictArea }: CreateAppRouterArgs) {
  return createModeWrappedBrowserRouter({ renderDictArea });
}
