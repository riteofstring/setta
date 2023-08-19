import { allSockets } from './allSockets';

export function sendToUser(user, message) {
  if (user in allSockets) {
    for (const s of allSockets[user]) {
      if (s.location === message.location) {
        s.send(JSON.stringify(message));
      }
    }
  }
}

export function wsReceiveMessage(ws) {
  return (data) => {
    const x = JSON.parse(data);
    if ('location' in x) {
      ws.location = x.location;
    }
  };
}
