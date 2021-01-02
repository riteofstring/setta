// const Pty = require('node-pty');

// function socket() {

// 	var self = this;

// 	self.encodedecode = false;
// 	self.autodestroy();

// 	self.on('open', function(client) {

// 		// Each client will have own terminal
// 		client.tty = Pty.spawn('bash', [], { name: 'xterm-color', cols: 80, rows: 24, cwd: process.env.PWD, env: process.env });

// 		client.tty.on('exit', function(code, signal) {
// 			// What now?
// 			client.tty = null;
// 			client.close();
// 		});

// 		client.tty.on('data', function(data) {

// 			// If you have a problem just uncomment the code below:
// 			// console.log(data);

// 			client.send(data);
// 		});

// 	});

// 	self.on('close', function(client) {
// 		if (client.tty) {
// 			client.tty.kill(9);
// 			client.tty = null;
// 		}
// 	});

// 	self.on('message', function(client, msg) {
// 		client.tty && client.tty.write(msg);
// 	});
// }


// var ws = new WebSocket("http://localhost:3000/");

// ws.onopen = function() {
//     new attach.attach(term, ws);
// };