import { readFileSync } from "node:fs";
import {
  createServer as createHTTPServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { fileURLToPath } from "node:url";

const packageMetadata = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

export const packageVersion = packageMetadata.version;

export function createServer() {
  return createHTTPServer((request, response) => {
    logRequest(request);
    if (request.method === "GET" && request.url === "/") {
      writeJSON(response, 200, { service: "setta-eval-fixture" });
      return;
    }
    writeJSON(response, 404, { error: "not_found" });
  });
}

function logRequest(request: IncomingMessage) {
  process.stdout.write(
    `${JSON.stringify({ event: "request", path: request.url ?? "/" })}\n`,
  );
}

function writeJSON(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function parsePort(value: string | undefined) {
  const port = Number.parseInt(value ?? "3000", 10);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid PORT value: ${value ?? ""}`);
  }
  return port;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createServer();
  server.listen(parsePort(process.env.PORT), "127.0.0.1", () => {
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("HTTP server did not expose a TCP address");
    }
    process.stdout.write(
      `${JSON.stringify({ event: "listening", port: address.port })}\n`,
    );
  });
}
