const protocolVersion = Number.parseInt(
  process.env.SETTA_BACKEND_SUPERVISOR_PROTOCOL_VERSION ?? "",
  10,
);
if (!Number.isInteger(protocolVersion) || protocolVersion <= 0) {
  console.error("SETTA_BACKEND_SUPERVISOR_PROTOCOL_VERSION is required");
  process.exit(2);
}

console.log(
  JSON.stringify({
    event: "ready",
    addr: "127.0.0.1:41002",
    bootstrapToken: "post_ready_token",
    protocolVersion,
  }),
);
setTimeout(() => console.log("post-ready stdout"), 20);
setInterval(() => {}, 1000);
