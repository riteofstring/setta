console.log(JSON.stringify({ event: "ready", addr: "127.0.0.1:41001" }));
setTimeout(() => process.exit(12), 20);
