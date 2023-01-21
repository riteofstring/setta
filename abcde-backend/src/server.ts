import { BACKEND_PORT } from 'abcde-utils/src/addresses';
import http from 'http';
import { app, passportSession } from './app/app';
import { sessionParser } from './app/sessionParser';
import { wss } from './websocket/websocket';

const server = http.createServer(app);
const allSockets = {};

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
      const connId = req.url.replace(/^\/+/g, ''); // remove leading slash
      if (!(req.user in allSockets)) {
        allSockets[req.user] = {};
      }
      allSockets[req.user][connId] = ws;
      console.log('allSockets', allSockets);
      wss.emit('connection', ws, req);
    });
  });
}

export function sendToUser(user, message) {
  if (user in allSockets) {
    console.log(`sending ${message} to ${user}`);
    allSockets[user].send(JSON.stringify(message));
  }
}
