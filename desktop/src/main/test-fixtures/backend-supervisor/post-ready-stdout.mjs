console.log(
  JSON.stringify({
    event: "ready",
    addr: "127.0.0.1:41002",
    localPairingToken: "post_ready_token",
    protocolVersion: 7,
  }),
);
setTimeout(() => console.log("post-ready stdout"), 20);
setInterval(() => {}, 1000);
