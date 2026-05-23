const GPU_FLOW_DIGEST_VERSION = "setta-gpu-flow-digest:v1";
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

export function createGpuFlowJsonDigest(
  namespace: string,
  value: unknown,
): string {
  return createGpuFlowTextDigest(namespace, JSON.stringify(value));
}

export function createGpuFlowTextDigest(
  namespace: string,
  value: string,
): string {
  let primary = FNV_OFFSET_BASIS;
  let secondary = FNV_OFFSET_BASIS ^ 0x9e3779b9;
  primary = mixGpuFlowDigestText(primary, namespace);
  primary = mixGpuFlowDigestCodeUnit(primary, 0);
  secondary = mixGpuFlowDigestText(secondary, namespace);
  secondary = mixGpuFlowDigestCodeUnit(secondary, 0);
  primary = mixGpuFlowDigestText(primary, value);
  secondary = mixGpuFlowDigestText(secondary, value);
  return [
    GPU_FLOW_DIGEST_VERSION,
    namespace,
    value.length.toString(36),
    primary.toString(16).padStart(8, "0"),
    secondary.toString(16).padStart(8, "0"),
  ].join(":");
}

function mixGpuFlowDigestText(digest: number, value: string): number {
  let mixed = digest;
  for (let index = 0; index < value.length; index += 1) {
    mixed = mixGpuFlowDigestCodeUnit(mixed, value.charCodeAt(index));
  }
  return mixed;
}

function mixGpuFlowDigestCodeUnit(digest: number, codeUnit: number): number {
  return Math.imul(digest ^ codeUnit, FNV_PRIME) >>> 0;
}
