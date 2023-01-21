import { WebSocketServer } from 'ws';
import { addPing } from './ping';

export const wss = new WebSocketServer({ noServer: true });

addPing(wss);
