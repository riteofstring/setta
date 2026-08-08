import { buildPackageArtifact } from "./lib/package-artifact.mjs";

const tarballPath = buildPackageArtifact();
console.log(`Verified package artifact: ${tarballPath}`);
