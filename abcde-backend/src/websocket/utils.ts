import { allSockets } from './allSockets';

export function sendToUser(user, message) {
  if (user in allSockets) {
    for (const s of allSockets[user]) {
      if (s.currPage === message.pathname) {
        s.send(JSON.stringify(message));
      }
    }
  }
}

export function wsReceiveMessage(ws) {
  return (data) => {
    const x = JSON.parse(data);
    if ('currPage' in x) {
      ws.currPage = x.currPage;
    }
  };
}
