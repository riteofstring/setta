import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import { chromium } from "@playwright/test";

import { buildPackageArtifact } from "./lib/package-artifact.mjs";
import { repositoryRoot, runPnpm } from "./lib/process.mjs";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
]);

function consumerAssetPath(distributionRoot, requestUrl) {
  const pathname = new URL(requestUrl ?? "/", "http://127.0.0.1").pathname;
  const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const candidate = path.resolve(distributionRoot, relativePath);
  if (candidate !== distributionRoot && !candidate.startsWith(`${distributionRoot}${path.sep}`)) {
    return null;
  }
  return candidate;
}

async function startConsumerServer(distributionRoot) {
  const server = createServer((request, response) => {
    const assetPath = consumerAssetPath(distributionRoot, request.url);
    if (assetPath === null) {
      response.writeHead(403).end();
      return;
    }
    try {
      const contents = readFileSync(assetPath);
      response
        .writeHead(200, {
          "Content-Type": contentTypes.get(path.extname(assetPath)) ?? "application/octet-stream",
        })
        .end(contents);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        response.writeHead(404).end();
        return;
      }
      throw error;
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Packed consumer server did not expose a TCP address.");
  }
  return { server, url: `http://127.0.0.1:${String(address.port)}` };
}

async function closeConsumerServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function verifyConsumerRuntime(distributionRoot) {
  const browser = await chromium.launch();
  try {
    const { server, url } = await startConsumerServer(distributionRoot);
    try {
      const page = await browser.newPage({ viewport: { height: 900, width: 1280 } });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(url);

      const consumerItems = page.getByRole("group", { exact: true, name: "Consumer items" });
      await consumerItems.waitFor();
      await consumerItems.getByRole("button", { name: "Move Consumer group" }).waitFor();
      const filterState = await consumerItems.evaluate((element) => ({
        canonicalCount: element.getAttribute("data-sortable-item-canonical-count"),
        filtered: element.hasAttribute("data-sortable-item-filtered"),
        visibleCount: element.getAttribute("data-sortable-item-visible-count"),
      }));
      if (
        !filterState.filtered ||
        filterState.canonicalCount !== "2" ||
        filterState.visibleCount !== "1"
      ) {
        throw new Error("Packed consumer did not render the filtered canonical item contract.");
      }

      const workspace = page.getByRole("region", { exact: true, name: "Consumer workspace" });
      await workspace.getByRole("article", { name: "Consumer note 1" }).waitFor();
      await workspace.getByRole("textbox", { name: "Consumer note body" }).waitFor();
      await workspace
        .getByRole("region", { name: "Consumer saved views" })
        .getByRole("button", { name: "Restore Consumer overview" })
        .waitFor();

      await workspace.getByRole("button", { name: "Add section" }).click();
      await workspace
        .getByRole("dialog", { name: "Add a section" })
        .getByRole("button", { name: "Consumer note" })
        .click();
      const created = workspace.getByRole("article", { name: "Consumer note 2" });
      await created.waitFor();
      await created.getByRole("button", { name: "Rename Consumer note 2" }).click();
      const title = created.getByRole("textbox", { name: "Section title" });
      await title.fill("Packed consumer note");
      await created.getByRole("button", { name: "Save title" }).click();
      await workspace.getByRole("article", { name: "Packed consumer note" }).waitFor();

      await workspace.getByRole("button", { name: "Add section" }).click();
      await workspace
        .getByRole("dialog", { name: "Add a section" })
        .getByRole("button", { name: "Consumer group" })
        .click();
      const createdGroup = workspace.getByRole("article", { name: "Consumer group 3" });
      await createdGroup.waitFor();
      await createdGroup.getByRole("textbox", { name: "Consumer note body" }).waitFor();
      await workspace.getByRole("button", { name: "Arrange consumer sections" }).click();
      await createdGroup.waitFor();

      if (pageErrors.length > 0) {
        throw new Error(`Packed consumer runtime errors:\n${pageErrors.join("\n")}`);
      }
    } finally {
      await closeConsumerServer(server);
    }
  } finally {
    await browser.close();
  }
}

const tarballPath = buildPackageArtifact();
const temporaryRoot = mkdtempSync(path.join(tmpdir(), "setta-workspace-consumer-"));

try {
  cpSync(path.join(repositoryRoot, "fixtures/consumer"), temporaryRoot, { recursive: true });
  const manifestPath = path.join(temporaryRoot, "package.json");
  const manifest = readFileSync(manifestPath, "utf8").replace(
    "file:__SETTA_WORKSPACE_TARBALL__",
    `file:${tarballPath}`,
  );
  writeFileSync(manifestPath, manifest);

  runPnpm(["install", "--no-frozen-lockfile"], { cwd: temporaryRoot });
  runPnpm(["install", "--frozen-lockfile"], { cwd: temporaryRoot });
  runPnpm(["run", "build"], { cwd: temporaryRoot });
  await verifyConsumerRuntime(path.join(temporaryRoot, "dist"));
  console.log("Packed consumer fixture built and ran successfully.");
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
