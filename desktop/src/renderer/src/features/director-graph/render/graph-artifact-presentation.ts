/**
 * Alternate particle fields used while an artifact occupies the command-center
 * surface. The graph canvas owns the transition amounts; React only selects a
 * destination, so opening an artifact never turns animation into render state.
 */
export type GraphArtifactParticleStyle = "particle-flow" | "fluid";

/**
 * Gives every artifact a stable pair of shader phases. The result looks
 * irregular across artifacts without changing underneath the user when the
 * same artifact is reopened.
 */
export function graphArtifactParticleSeed(artifactId: string): readonly [number, number] {
  return [
    graphArtifactParticleSeedChannel(artifactId, 0x9e3779b9),
    graphArtifactParticleSeedChannel(artifactId, 0x85ebca6b),
  ];
}

function graphArtifactParticleSeedChannel(value: string, salt: number): number {
  let hash = (0x811c9dc5 ^ salt) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0xffffffff;
}
