// const { runProgram } = require("./runners");
const WebSocket = require('ws');

var ws_url = "ws://localhost:8000/ws/newGeneratedCode/";
var newGeneratedCodeSocket = new WebSocket(ws_url);

exports.newGeneratedCodeSocket = newGeneratedCodeSocket;
