// var ws_url = "ws://localhost:8000/ws/cli/";
// var cliSocket = new WebSocket(ws_url);

// cliSocket.onmessage = function (event) {
//   var data = JSON.parse(event.data);
//   console.log("data", data);
//   // do whatever required with received data ...
// };

// export { cliSocket };

export const getCLISocket = (token) => {
  var ws_url = "ws://localhost:8000/ws/cli/";
  var cliSocket = new WebSocket(ws_url);

  cliSocket.onmessage = function (event) {
    var data = JSON.parse(event.data);
    console.log("data", data);
    // do whatever required with received data ...
  };
  
  return cliSocket
};
