var net = require('net');
var dns = require('dns');
var mapping = require('./mappings');
var protocol = require('./protocol');
var clientloop = require('./clientloop');
var serverloop = require('./serverloop');
var routerloop = require('./routerloop');

// SETUP
// Setup listening socket, but ignore requests until registered
//  handlers
// Setup any datastructures
// Build a circuit:
//  Connect to other nodes
// Register with reg service
//  Need way to interface with reg service
var nodeID = generateNodeID();
var args = process.argv.slice(2);
var torNodePort = args[0]; // CHANGE


// need mapping from nodes -> sockets
var torNode = net.createServer((socket) => {
  routerloop.socketSetup(socket);
});

torNode.on('error', (err) => {

});


server.listen(torNodePort); // can add callback

/* Notes:
 * Maybe we should connect to all routers so that the relay-extend
 * time is shorter (and so we don't hit timeouts)
 *
 * The only times we have sequential control sequences is when opening
 * a connection or a stream and then sending a create or data. 
 * We can use the map mentioned above and should be on a per-socket basis
 *
 *
 *
 * We need a pending message response map which use the request/key
 * components as a key and a callback function as the mapped value
 * and then when we receive a response we can cancel the timeout
 * and execute the callback
 */

// fetch list of all nodes
var routerList = [];
// determine circuit
// choose first node and send Open/Create
// THIS IS PSEUDOCODE
function connectToRouter(rip,r port, rID) {
  try {
    currSocket = net.createConnection({host: rip, port: rport});
    routerLoop.socketSetup(currSocket);
    protocol.sendOpen(currSocket, nodeID, rID);
    // we should block until we get an Opened or hit a timeout?
  } catch(err) {
    return null;
  }
}

do{
currRouter = routerList[random(0, routerList.length)];
currSock = connectToRouter(currRouter.ip, currRouter.port, currRouter.id); 
//
protocol.sendCreate(socket, currCircID);
}while(currSock == null);

for (int i = 1; i < circLength; i ++) {
  // same thing but pick a node and send relay extend
  
}



// TEARDOWN
//  Teardown circuit (send Destroy)
//    Forward Destroy (and hope it propagates)
//    (?) Send Destroy backwards & forwards for any circuits passing through us
//  Closing as many sockets as possible
//    Need a way to interrupt either event loop


// Global Event Emitter
//  each client connection should register their own listener for custom
//  shutdown event
//    close relevant in-scope sockets


// Timeout handlers
//  if no response or circuit broken:
//    teardown (as much as possible)
//    Attempt to rebuild circuit using fresh node list


// Need function/mapping to multiplex sockets and circuits
// CircID->node->socket
//
//client event loop


// register with service
