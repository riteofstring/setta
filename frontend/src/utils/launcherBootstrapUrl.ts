import { C_ADDRESSES } from "utils/c_addresses";
import { appendLauncherOriginToBootstrapUrlFragment } from "utils/launcherOrigin";

export function resolveLauncherBootstrapUrl(
  bootstrapUrlFragment: string,
): string {
  if (import.meta.env?.DEV) {
    return bootstrapUrlFragment;
  }
  return appendLauncherOriginToBootstrapUrlFragment(
    bootstrapUrlFragment,
    C_ADDRESSES.LAUNCHER_ORIGIN,
  );
}
