console.error("stderr log");
console.log("stdout log");
console.log(JSON.stringify({ event: "ready", addr: "127.0.0.1:41000" }));
setInterval(() => {}, 1000);
