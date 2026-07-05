import { createServer } from "node:http";

const protocolVersion = Number.parseInt(
  process.env.SETTA_BACKEND_SUPERVISOR_PROTOCOL_VERSION ?? "9",
  10,
);

const server = createServer((request, response) => {
  if (request.method !== "GET" || request.url !== "/runtime/info") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { code: "not_found", message: "not found" } }));
    return;
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      backendName: "setta-backend",
      backendVersion: "test",
      displayName: "Supervisor Fixture Runtime",
      infrastructureProvider: {
        displayName: "Unknown provider",
        iconUrl: "",
        id: "unknown",
      },
      protocolVersion,
      runtimeId: "runtime_supervisor_fixture",
      vapidPublicKey: "",
    }),
  );
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (address === null || typeof address === "string") {
    console.error("unexpected fixture server address");
    process.exit(2);
  }
  console.log(
    JSON.stringify({
      event: "ready",
      addr: `${address.address}:${address.port}`,
      bootstrapToken: "runtime_info_token",
      protocolVersion,
    }),
  );
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
