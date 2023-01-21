import { BACKEND_PORT } from 'abcde-utils/src/addresses';
import http from 'http';
import { app, passportSession } from './app';
import { sessionParser } from './sessionParser';
import { wss } from './websocket';

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
      wss.emit('connection', ws, req);
    });
  });
}
