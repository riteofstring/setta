import type { ProjectConfig } from "utils/generatedTypes";

export function resolveDefaultProjectConfigName(
  defaultProjectConfigId: string | null,
  projectMetadata: Array<ProjectConfig>,
): string | null {
  if (!defaultProjectConfigId) {
    return null;
  }
  for (const config of projectMetadata) {
    if (config.id === defaultProjectConfigId) {
      return config.name;
    }
  }
  return null;
}

export function shouldLoadDefaultProjectMetadata({
  enabled,
  hasAttemptedMetadataLoad,
  projectMetadataCount,
}: {
  enabled: boolean;
  hasAttemptedMetadataLoad: boolean;
  projectMetadataCount: number;
}): boolean {
  return enabled && !hasAttemptedMetadataLoad && projectMetadataCount === 0;
}
