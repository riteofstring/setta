import { BACKEND_PORT } from 'abcde-utils/src/addresses';
import http from 'http';
import { app, passportSession } from './app/app';
import { sessionParser } from './app/sessionParser';
import { allSockets } from './websocket/allSockets';
import { wsReceiveMessage } from './websocket/utils';
import { wss } from './websocket/websocket';

const server = http.createServer(app);

server.on('upgrade', function upgrade(req, socket, head) {
  runSessionParser(req, socket, head);
});

server.listen(BACKEND_PORT, () => {
  console.log(`Example app listening on port ${BACKEND_PORT}`);
});

function runSessionParser(req, socket, head) {
  sessionParser(req, {}, () => {
    runPassportAuth(req, socket, head);
  });
}

function runPassportAuth(req, socket, head) {
  passportSession(req, {}, () => {
    if (!req.isAuthenticated()) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, function (ws) {
      if (!(req.user in allSockets)) {
        allSockets[req.user] = {};
      }
      const websocketId = req.url;
      const userSockets = allSockets[req.user];
      userSockets[websocketId] = ws;
      ws.on('message', wsReceiveMessage(req, ws, websocketId));
      ws.on('close', () => delete userSockets[websocketId]);
      wss.emit('connection', ws, req);
    });
  });
}
