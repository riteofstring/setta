console.log(
  JSON.stringify({
    event: "ready",
    addr: "127.0.0.1:41002",
    bootstrapToken: "post_ready_token",
    protocolVersion: 9,
  }),
);
setTimeout(() => console.log("post-ready stdout"), 20);
setInterval(() => {}, 1000);
