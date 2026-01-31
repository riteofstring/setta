import { res200 } from "utils/endpointUtils";
import { route_binary_upload } from "utils/generatedEndpoints";
import { BinaryContentRef } from "utils/generatedTypes";

type DrawSnapshotProvider = () => Promise<Blob | null> | Blob | null;

const drawSnapshotProviders = new Map<string, DrawSnapshotProvider>();

export function registerDrawSnapshotProvider(
  sectionId: string,
  provider: DrawSnapshotProvider,
): void {
  drawSnapshotProviders.set(sectionId, provider);
}

export function unregisterDrawSnapshotProvider(sectionId: string): void {
  drawSnapshotProviders.delete(sectionId);
}

export async function collectDrawSnapshotPayloads(
  sectionIds: string[],
): Promise<Record<string, BinaryContentRef> | null> {
  const payloads: Record<string, BinaryContentRef> = {};
  const entries = await Promise.all(
    sectionIds.map(async (sectionId) => {
      const provider = drawSnapshotProviders.get(sectionId);
      if (!provider) {
        return null;
      }
      const result = await provider();
      if (!result) {
        return null;
      }
      return { sectionId, blob: result };
    }),
  );
  const blobs = entries.filter(
    (entry): entry is { sectionId: string; blob: Blob } => entry !== null,
  );
  if (blobs.length === 0) {
    return null;
  }
  const uploads = await Promise.all(
    blobs.map(async ({ sectionId, blob }) => {
      const form = new FormData();
      form.append("file", blob, "snapshot.png");
      form.append("durable", "false");
      const res = await route_binary_upload(form);
      if (!res200(res)) {
        return null;
      }
      return { sectionId, ref: res.data };
    }),
  );
  for (const upload of uploads) {
    if (!upload) {
      continue;
    }
    payloads[upload.sectionId] = upload.ref;
  }
  return Object.keys(payloads).length > 0 ? payloads : null;
}
