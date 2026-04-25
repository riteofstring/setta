import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(scriptDir, "..");
const srcDir = resolve(frontendDir, "src");
const distDir = resolve(frontendDir, "dist");

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
copyFileSync(resolve(srcDir, "index.js"), resolve(distDir, "index.js"));
copyFileSync(resolve(srcDir, "index.css"), resolve(distDir, "index.css"));
