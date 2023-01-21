import { WebSocketServer } from 'ws';

export const wss = new WebSocketServer({ noServer: true });

wss.on('connection', function connection(ws) {
  ws.on('message', function message(data) {
    ws.send(`you said: ${data}`);
  });

  ws.send('websocket connected');
});
