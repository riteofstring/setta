import { allSockets } from './allSockets';

function heartbeat() {
  this.isAlive = true;
}

// modified from https://github.com/websockets/ws#how-to-detect-and-close-broken-connections
export function addPing(wss) {
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', heartbeat);
  });

  const interval = setInterval(ping, 5000);

  wss.on('close', () => {
    clearInterval(interval);
  });
}

function ping() {
  for (const clients of Object.values(allSockets)) {
    for (const ws of Object.values(clients)) {
      if (ws.isAlive === false) {
        ws.terminate();
      } else {
        ws.isAlive = false;
        ws.ping();
      }
    }
  }
}
