function heartbeat() {
  this.isAlive = true;
}

// from https://github.com/websockets/ws#how-to-detect-and-close-broken-connections
export function addPing(wss) {
  wss.on('connection', function connection(ws) {
    ws.isAlive = true;
    ws.on('pong', heartbeat);
  });

  const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
      if (ws.isAlive === false) return ws.terminate();
      console.log('ping');

      ws.isAlive = false;
      ws.ping();
    });
  }, 5000);

  wss.on('close', function close() {
    clearInterval(interval);
  });
}
