import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { repositoryRoot, runPnpm } from "./process.mjs";

export const browserFixtureRoot = path.join(
  repositoryRoot,
  "fixtures/packed-consumer",
);

export function buildBrowserFixture(skipBuild) {
  if (skipBuild) return;
  runPnpm(["--filter", "@riteofstring/setta", "run", "build"]);
  runPnpm(["--filter", "@setta/packed-consumer-source", "run", "build"]);
}

export async function serveBrowserFixture(root) {
  const dist = path.join(root, "dist");
  const files = new Map([
    [
      "/",
      { body: readFileSync(path.join(dist, "index.html")), type: "text/html" },
    ],
  ]);
  const types = {
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
  };
  for (const name of readdirSync(path.join(dist, "assets"))) {
    files.set(`/assets/${name}`, {
      body: readFileSync(path.join(dist, "assets", name)),
      type: types[path.extname(name)] ?? "application/octet-stream",
    });
  }
  const server = createServer((request, response) => {
    const file = files.get(request.url?.split("?")[0]);
    response.writeHead(file ? 200 : 404, {
      "Content-Type": file?.type ?? "text/plain",
    });
    response.end(file?.body ?? "Not found");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}
