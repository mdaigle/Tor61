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
    // buffer until 512 bytes
    dataBuffer.append(data);
    while (dataBuffer.length >= 512) {
      // process message 
      // slice out current msg
      msg = dataBuffer.slice(0, 512);
      // check command, handle appropriately
      circID, command = unpackMainFields(msg);
      if (command < 0 || command > 8) {
        console.log("bad message");
        return;
      }
      socketValidated = false;
      otherNodeID = null;
      msgFields = protocol.unpack(command, msg)
      switch (command) {
        // may need a concept of last msg sent or any outstanding circuit
        // building/setup messages
        case protocol.OPEN:
          // assert destNodeID == nodeID
          if (msgFields.destID != nodeID) {
            protocol.sendOpenFailed(socket, msgFields.openerID, msgFields.destID);
          // assert msgFields.openerID != self.nodeID
          mappings.addNodeToSocketMapping(msgFields.openerID, socket);
          protocol.sendOpened(socket, msgFields.openerID, msgFields.destID);
          socketValidated = true;
          openerID = msgFields.openerID;
        case protocol.OPENED:
          // circuit successfully added the first router
          // Execute message queue?
        case protocol.OPEN_FAILED:
          // connecting to a node failed
          // either need to send an extend failed (?) or we failed to connect to
          // our first router
        case protocol.CREATE:
          // add mapping and send created
          // M: This really should be srcID, destID, circID and should be keyed
          // on circID
          mappings.addCircuitMapping(otherNodeID, circID, nodeID, null);
          protocol.sendCreated(socket, circID);
        case protocol.CREATED:
          // mapping successful
          // Need a concept of outstanding messages with a specific node
          // or do we?
          mappings.addCircuitMapping(otherNodeID, circID, nodeID, null);
        case protocol.CREATE_FAILED:
          // we failed. Either send an extend failed OR we failed to connect to
          // the first router in our circuit and need to restart 
          // Need to know outstanding messages
        case protocol.DESTROY:
          
        case protocol.RELAY:
          //   If end node for circuit, call to lib for sending to server.
          //   Either forward to server with existing connection
          //   or
          //   Create new connection to host
          //    dns lookup
          //    new socket
          //    callbacks => multiplex circID/socket etc.
          //  Forward all incoming data according to circuit map
 
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
