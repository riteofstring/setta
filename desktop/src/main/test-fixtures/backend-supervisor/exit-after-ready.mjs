console.log(
  JSON.stringify({
    event: "ready",
    addr: "127.0.0.1:41001",
    localPairingToken: "exit_after_ready_token",
    protocolVersion: 64,
  }),
);
setTimeout(() => process.exit(12), 20);
