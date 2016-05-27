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
// Event loop for internal sockets
//   If end node for circuit, call to lib for sending to server.
//   Either forward to server with existing connection
//   or
//   Create new connection to host
//    dns lookup
//    new socket
//    callbacks => multiplex circID/socket etc.
//  Forward all incoming data according to circuit map
  var dataBuffer = Buffer.alloc(512, 0);
  var bytesRead = 0;
  socket.on('data', function (data) {
    // listen for protocol stuff
    // buffer until 512 bytes
    dataBuffer.append(data);
    while (dataBuffer.length >= 512) {
      // process message 
      // check command, handle appropriately
      // set 
      // if open msg
        // assert destNodeID == nodeID
        mappings.addNodeToSocketMapping(nid, socket);

      // processed dataBuffer
      dataBuffer = Buffer.from(dataBuffer.slice(512, dataBuffer.length));
    }
  });   
  socket.on('close', function() {
    // teardown any pertinent circuits
    //
  });
});

torNode.on('error', (err) => {

});


server.listen(torNodePort); // can add callback

// fetch list of all nodes
// determine circuit
// connect to each node


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
