import { getImportText } from 'src/middleware/runs/codeGenerator';
import { allSockets } from './allSockets';

export function sendToUser(user, message) {
  if (user in allSockets) {
    for (const s of allSockets[user]) {
      if (s.location === message.toLocation) {
        s.send(JSON.stringify(message));
      }
    }
  }
}

export function wsReceiveMessage(req, ws) {
  return (data) => {
    const x = JSON.parse(data);
    if ('location' in x) {
      ws.location = x.location;
    }
    if (x.messageType === 'codeCompletionRequest') {
      x.message = `${getImportText(x.message)}; ${x.message}`;
      sendToUser(req.user, { ...x, location: ws.location });
    }
    if (x.messageType === 'codeCompletion') {
      sendToUser(req.user, { ...x, location: ws.location });
    }
  };
}
