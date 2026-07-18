console.error("stderr log");
console.log("stdout log");
console.log(
  JSON.stringify({
    event: "ready",
    addr: "127.0.0.1:41000",
    localPairingToken: "ready_with_logs_token",
    protocolVersion: 7,
  }),
);
setInterval(() => {}, 1000);
