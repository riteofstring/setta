const protocolVersion = Number.parseInt(
  process.env.SETTA_BACKEND_SUPERVISOR_PROTOCOL_VERSION ?? "",
  10,
);
if (!Number.isInteger(protocolVersion) || protocolVersion <= 0) {
  console.error("missing backend supervisor protocol version");
  process.exit(2);
}

console.error("stderr log");
console.log("stdout log");
console.log(
  JSON.stringify({
    event: "ready",
    addr: "127.0.0.1:41000",
    bootstrapToken: "ready_with_logs_token",
    protocolVersion,
  }),
);
setInterval(() => {}, 1000);
