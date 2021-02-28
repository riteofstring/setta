var ws_url = "ws://localhost:8000/ws/newUI/";
var newUISocket = new WebSocket(ws_url);

newUISocket.onmessage = function (event) {
  var data = JSON.parse(event.data);
  console.log("data", data);
  // do whatever required with received data ...
};

export { newUISocket };
