import {
  callOpenAPI,
  downloadBinary,
  loadCachedImageArtifacts,
  res200,
  type ImageArtifact,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import { useEffect } from "react";
import {
  createWithEqualityFn,
  withAppSubsystemResetFn,
} from "./appSubsystemStore";

type AppSubsystemImageArtifactsState = {
  artifactsById: Record<string, ImageArtifact>;
  decodedImagesById: Record<string, HTMLImageElement>;
};

type LoadCachedImageArtifactsRouteResponse = ResponseDataAndStatus<
  Array<ImageArtifact>
>;
type DownloadBinaryRouteResponse = ResponseDataAndStatus<Blob | File>;

const useAppSubsystemImageArtifactsStore = createWithEqualityFn(
  withAppSubsystemResetFn<AppSubsystemImageArtifactsState>(() => ({
    artifactsById: {},
    decodedImagesById: {},
  })),
);

function revokeImageObjectUrl(
  image: HTMLImageElement | null | undefined,
): void {
  const objectUrl = image?.dataset.objectUrl;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
  }
}

async function blobToImageElement(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.src = objectUrl;
  await image.decode();
  image.dataset.objectUrl = objectUrl;
  return image;
}

async function loadImageArtifactsById(paths: Array<string>): Promise<void> {
  if (paths.length === 0) {
    return;
  }
  const response = (await callOpenAPI(
    loadCachedImageArtifacts({
      body: {
        paths,
      },
    } as Parameters<typeof loadCachedImageArtifacts>[0]),
  )) as LoadCachedImageArtifactsRouteResponse;
  if (!res200(response)) {
    return;
  }
  useAppSubsystemImageArtifactsStore.setState((state) => {
    let changed = false;
    const nextArtifactsById = { ...state.artifactsById };
    const nextDecodedImagesById = { ...state.decodedImagesById };

    for (const imageArtifact of response.data) {
      if (!imageArtifact) {
        continue;
      }
      const existing = state.artifactsById[imageArtifact.id];
      if (
        existing &&
        existing.value.contentId === imageArtifact.value.contentId &&
        existing.value.mimeType === imageArtifact.value.mimeType
      ) {
        continue;
      }
      changed = true;
      nextArtifactsById[imageArtifact.id] = imageArtifact;
      const existingDecoded = nextDecodedImagesById[imageArtifact.id];
      if (
        existingDecoded &&
        existingDecoded.dataset.contentId !== imageArtifact.value.contentId
      ) {
        revokeImageObjectUrl(existingDecoded);
        delete nextDecodedImagesById[imageArtifact.id];
      }
    }

    if (!changed) {
      return state;
    }
    return {
      artifactsById: nextArtifactsById,
      decodedImagesById: nextDecodedImagesById,
    };
  });
}

async function decodeImageArtifactById(artifactId: string): Promise<void> {
  const imageArtifact =
    useAppSubsystemImageArtifactsStore.getState().artifactsById[artifactId];
  if (!imageArtifact) {
    return;
  }
  const response = (await callOpenAPI(
    downloadBinary({
      path: {
        contentId: imageArtifact.value.contentId,
      },
    } as Parameters<typeof downloadBinary>[0]),
  )) as DownloadBinaryRouteResponse;
  if (!res200(response) || !response.data) {
    return;
  }
  const decodedImage = await blobToImageElement(response.data);
  decodedImage.dataset.contentId = imageArtifact.value.contentId;
  useAppSubsystemImageArtifactsStore.setState((state) => {
    const currentArtifact = state.artifactsById[artifactId];
    if (
      !currentArtifact ||
      currentArtifact.value.contentId !== imageArtifact.value.contentId
    ) {
      revokeImageObjectUrl(decodedImage);
      return state;
    }
    const existingDecoded = state.decodedImagesById[artifactId];
    if (existingDecoded?.dataset.contentId === imageArtifact.value.contentId) {
      revokeImageObjectUrl(decodedImage);
      return state;
    }
    if (existingDecoded) {
      revokeImageObjectUrl(existingDecoded);
    }
    return {
      decodedImagesById: {
        ...state.decodedImagesById,
        [artifactId]: decodedImage,
      },
    };
  });
}

function useAppImageArtifactById(
  artifactId: string | null,
): ImageArtifact | null {
  const imageArtifact = useAppSubsystemImageArtifactsStore((state) =>
    artifactId ? state.artifactsById[artifactId] ?? null : null,
  );

  useEffect(() => {
    if (!artifactId || imageArtifact) {
      return;
    }
    void loadImageArtifactsById([artifactId]);
  }, [artifactId, imageArtifact]);

  return imageArtifact;
}

export function useDecodedAppImageById(
  artifactId: string | null,
): HTMLImageElement | null {
  const imageArtifact = useAppImageArtifactById(artifactId);
  const decodedImage = useAppSubsystemImageArtifactsStore((state) =>
    artifactId ? state.decodedImagesById[artifactId] ?? null : null,
  );

  useEffect(() => {
    if (!artifactId || !imageArtifact) {
      return;
    }
    if (
      decodedImage &&
      decodedImage.dataset.contentId === imageArtifact.value.contentId
    ) {
      return;
    }
    void decodeImageArtifactById(artifactId);
  }, [artifactId, decodedImage, imageArtifact]);

  return decodedImage;
}

export function resetAppSubsystemImageArtifactsState(): void {
  const state = useAppSubsystemImageArtifactsStore.getState();
  for (const image of Object.values(state.decodedImagesById)) {
    revokeImageObjectUrl(image);
  }
  state.reset?.();
}
