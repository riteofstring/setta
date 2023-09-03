import { WebSocketServer } from 'ws';
import { addPing } from './ping';
import { wsOnConnection } from './utils';

export const wss = new WebSocketServer({
  noServer: true,
  clientTracking: false,
});

addPing(wss);

wss.on('connection', wsOnConnection);
