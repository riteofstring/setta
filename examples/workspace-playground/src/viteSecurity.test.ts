import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createServer, type ViteDevServer } from "vite";
import { expect, it } from "vitest";

it.each(["/", "/preview/"])(
  "rejects HTTP editor launches under %s",
  async (base) => {
    const root = await mkdtemp(path.join(tmpdir(), "setta-vite-security-"));
    let server: ViteDevServer | undefined;
    try {
      await writeFile(
        path.join(root, "index.html"),
        "<h1>Development fixture</h1>",
      );
      server = await createServer({
        configFile: fileURLToPath(
          new URL("../vite.config.ts", import.meta.url),
        ),
        root,
        base,
        logLevel: "silent",
        optimizeDeps: { noDiscovery: true, include: [] },
        server: { host: "127.0.0.1", port: 0, watch: null },
      });
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === "string") {
        throw new Error("The development server did not bind a TCP port.");
      }
      const origin = `http://127.0.0.1:${String(address.port)}`;
      const page = await fetch(new URL(base, origin));
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("<h1>Development fixture</h1>");

      const missing = new URL(`${base}__open-in-editor`, origin);
      missing.searchParams.set("file", path.join(root, "missing.ts"));
      expect((await fetch(missing)).status).toBe(403);

      for (const route of ["__open-in-editor", "__open-in-editor/"]) {
        const request = new URL(`${base}${route}`, origin);
        request.searchParams.set("file", path.join(root, "index.html"));
        const response = await fetch(request);
        expect(response.status).toBe(403);
        expect(await response.text()).toBe(
          "Opening desktop editors over HTTP is disabled.",
        );
      }
    } finally {
      await server?.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
