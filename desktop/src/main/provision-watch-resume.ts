import type { PendingProvisionRecord, PendingProvisionStore } from "./pending-provision-store";
import type { TailnetClient } from "./provision-watch";
import type { RuntimeRegistryController } from "./runtime-registry";

interface ProvisionWatchResumeError {
  error: unknown;
  provision: PendingProvisionRecord;
}

export interface ProvisionWatchResumeOptions {
  onError?: (failure: ProvisionWatchResumeError) => void;
  registry: Pick<RuntimeRegistryController, "watchProvisionAndPair">;
  store: Pick<PendingProvisionStore, "delete" | "readAll">;
  tailnetClient: TailnetClient;
}

export async function resumePendingProvisionWatches(
  options: ProvisionWatchResumeOptions,
): Promise<void> {
  const provisions = await options.store.readAll();
  for (const provision of provisions) {
    try {
      await options.registry.watchProvisionAndPair({
        pending: provision,
        tailnetClient: options.tailnetClient,
      });
      await options.store.delete(provision.provisionId);
    } catch (error) {
      options.onError?.({ error, provision });
    }
  }
}
