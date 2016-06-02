// TODO:
//  If we don't get a response we do nothing unless we are the first node in
//  which case we send a Destroy message and rebuild
//  We only do this if we timeout in a control sequence
//  If the client closes a connection we assume the end server was
//  unreachable/timedout
//
//  Also do callbacks for all send functions
//
//  Implement Global Event Emitter usage keyed on streamID
//
//  

function socketSetup(socket, createdByUs) {
  if (!createdByUs) {
    openTimeout = setTimeout(protocol.MSGTIMEOUT, function() {
      socket.end();
    }
  }
  var msgMap = {};
  socket["msgMap"] = msgMap;
  var dataBuffer = Buffer.alloc(512, 0);
  var bytesRead = 0;
  var otherNodeID = null;
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
          clearTimeout(openTimeout);
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
          // add nodeToSocketMapping
          // Or successfully added a new router
          if (protocol.OPEN in msgMap && msgMap[protocol.OPEN] != null) {
            msgMap[protocol.OPEN](protocol.OPENED);
            msgMap[protocol.OPEN] = null;
          }

        case protocol.OPEN_FAILED:
          // connecting to a node failed
          // either need to send an extend failed (?) or we failed to connect to
          // our first router
          if (protocol.OPEN in msgMap && msgMap[protocol.OPEN] != null) {
            msgMap[protocol.OPEN](protocol.OPEN_FAILED);
            msgMap[protocol.OPEN] = null;
          }

        case protocol.CREATE:
          // add mapping and send created
          // M: This really should be srcID, destID, circID and should be keyed
          // on circID
          mappings.addCircuitMapping(otherNodeID, circID, null, null);
          protocol.sendCreated(socket, circID);

        case protocol.CREATED:
          // mapping successful
          // Need a concept of outstanding messages with a specific node
          // or do we?
          mappings.addCircuitMapping(otherNodeID, circID, null, null);
          if (protocol.CREATE in msgMap && msgMap[protocol.CREATE] != null) {
            msgMap[protocol.CREATE](protocol.CREATED);
            msgMap[protocol.CREATE] = null;
          }

        case protocol.CREATE_FAILED:
          // we failed. Either send an extend failed OR we failed to connect to
          // the first router in our circuit and need to restart 
          // Need to know outstanding messages
          if (protocol.CREATE in msgMap && msgMap[protocol.CREATE] != null) {
            msgMap[protocol.CREATE](protocol.CREATE_FAILED);
            msgMap[protocol.CREATE] = null;
          }

        case protocol.DESTROY:
          destInfo = mappings.getCircuitMapping(otherNodeID, circID);
          otherSock = mappings.getNodeToSocketMapping(destInfo.nid);
          protocol.sendDestroy(otherSock, destInfo.circid);
          mappings.removeCircuitMapping(otherNodeID, circID);

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
    // teardown any pertinent
    if (otherNodeID != null) {
      mappings.removeNodeToSocketMapping(otherNodeID);
    }
  });
}
