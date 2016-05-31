function socketSetup(socket) {
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
          }
          // assert msgFields.openerID != self.nodeID
          // do we already have a mapping?
          mappings.addNodeToSocketMapping(msgFields.openerID, socket);
          protocol.sendOpened(socket, msgFields.openerID, msgFields.destID);
          socketValidated = true;
          openerID = msgFields.openerID;
        case protocol.OPENED:
          // circuit successfully added the first router
          // Execute message queue?
          // add nodeToSocketMapping
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
      } 
      // processed dataBuffer
      dataBuffer = Buffer.from(dataBuffer.slice(512, dataBuffer.length));
    }
  });   
  socket.on('close', function() {
    // teardown any pertinent circuits
    //
  });
}
