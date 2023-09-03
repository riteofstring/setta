import { getImportText } from 'src/middleware/runs/codeGenerator';
import { allSockets } from './allSockets';

export function sendToUser(user, message) {
  if (user in allSockets && message.toWebsocketId in allSockets[user]) {
    allSockets[user][message.toWebsocketId].send(JSON.stringify(message));
  }
}

export function sendToUserByLocation(user, message) {
  if (user in allSockets) {
    for (const s of Object.values(allSockets[user])) {
      if (s.location === message.toLocation) {
        s.send(JSON.stringify(message));
      }
    }
  }
}

export function wsReceiveMessage(req, ws, websocketId) {
  return (data) => {
    const x = JSON.parse(data);
    if ('location' in x) {
      ws.location = x.location;
    }
    if (x.messageType === 'codeCompletionRequest') {
      x.toComplete = `${getImportText(x.message)}; ${x.message}`;
    }
    if (x.messageType === 'parametersRequest') {
      x.message = `${getImportText(x.message)}; ${x.message}(`;
    }
    sendToUser(req.user, { ...x, location: ws.location, websocketId });
  };
}

export function sendAllConnectionsList(ws) {
  const connections: any = [];
  if (ws.user in allSockets) {
    for (const s of Object.values(allSockets[ws.user])) {
      connections.push({
        websocketId: s.websocketId,
        isCLI: s.isCLI,
      });
    }
  }

  if (ws.user in allSockets) {
    for (const s of Object.values(allSockets[ws.user])) {
      s.send(JSON.stringify({ messageType: 'allConnections', connections }));
    }
  }
}

export function wsOnConnection(ws) {
  ws.send(
    JSON.stringify({
      messageType: 'connection',
      websocketId: ws.websocketId,
    }),
  );

  sendAllConnectionsList(ws);
}
