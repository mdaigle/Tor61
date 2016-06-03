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
//
//
// TODO: send function is not storing timeouts. Need to add to msgMap and then
// cancel it when we get the correct response
var Buffer = require('buffer');
var net = require('net');
var mappings = require('./mappings');
var protocol = require('./protocol');
var serverloop = require('./serverloop');


// Note: send functions that should use this include:
//  sendCreate
//  sendOpen
//  sendRelay
//
// Timeout callback should be function(){rej();}
function sendWithPromise(sendFunction, successCallback, failCallback) {
  var ret = null;
  var p = new Promise(function(resolve, reject) {
    ret = sendFunction.bind(null, resolve, reject);
  });
  p.then(function(){
    successCallback();
  });
  p.catch(function() {
    failCallback();
  });
  return ret;
}

function initiateTorConnection(host, port, nodeID) {
  newSock = net.createConnection({host: host, port:port});
  this.socketSetup(newSock, nodeID, true); 
  sendWithPromise(protocol.sendOpen, successCallback, failCallback)(

}

function socketSetup(socket, nodeID, createdByUs) {
  if (!createdByUs) {
    openTimeout = setTimeout(protocol.MSGTIMEOUT, function() {
      socket.end();
    }
  }
  var msgMap = {};
  // TODO: For msg map need to have individual ids  for relay msgs something
  // like 10+relay_cmd
  socket["msgMap"] = msgMap;
  var dataBuffer = new Buffer(0);
  var bytesRead = 0;
  var otherNodeID = null;
  socket.on('data', function (data) {
    // buffer until 512 bytes
    // dataBuffer.append(data);
    dataBuffer = Buffer.concat([dataBuffer, data]);
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
      msgFields = protocol.unpack(command, msg);
      // TODO: These should all check if socket is validated before handling
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
          if (!createdByUs) {
            socketValidated = true;
          }
          openerID = msgFields.openerID;

        case protocol.OPENED:
          // circuit successfully added the first router
          // add nodeToSocketMapping
          // Or successfully added a new router
          if (createdByUs) {
            socketValidated = true;
          }
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
          // check if end node
          destInfo = mappings.getCircuitMapping(otherNodeID, circID);
          // TODO: add basecase circID -> null for our own circuit
          if (destInfo.nid == null || destInfo.circid == null) {
            // yay end node
            switch (msgFields.relay_cmd) {
              case protocol.RELAY_BEGIN:
                (new Promise(function(resolve, reject){
                  serverloop.initiateConnection(msgFields, otherNodeID, circID);
                })).then(function(){
                  // TODO: modify send Relay to allow null data
                  protocol.sendRelay(socket, circID, msgFields.stream_id, protocol.RELAY_CONNECTED, null);
                }).catch(function() {
                  protocol.sendRelay(socket, circID, msgFields.stream_id, protocol.RELAY_BEGIN_FAILED, null);
                });
              case protocol.RELAY_DATA:
                // get streamID and find socket, forward data
                destSock = mappings.getStreamToSocketMapping(msgFields.stream_id);
                if (destSock) {
                  destSock.write(msgFields.body);
                }

              case protocol.RELAY_END:
                // remove mappings, close socket to server
                destSock = mappings.getStreamToSOcketMapping(msgFields.stream_id);
                // TODO: send event to streamID if malcolm wants
                // TODO: streamIDs should be unique on a circuit
                destSock.end();
                mappings.removeStreamToSocketMapping(msgFields.stream_id);
              
              case protocol.RELAY_CONNECTED:
                // TODO: send event to streamID
                // TODO: event emitter should multiplex nodeID/circID and
                // streamID because streamIDs aren't unique globally

              case protocol.RELAY_EXTEND:
                // create connection to server as specified
                // TODO: parse host and port
                // TODO: we should partition this into another file
                var newSock = net.createConnection({host: host, port: port});
                this.socketSetup(newSock, nodeID, true);
                newSock.msgMap[protocol.OPEN] = function(response) {
                  if (response == protocol.OPENED) {
                    // send create
                  } else {
                    // return relay_extend_failed
                  }
                };
                // TODO: send Open with timeout that returns relay_extend_failed

              case protocol.RELAY_EXTENDED:
                // execute callback

              case protocol.RELAY_BEGIN_FAILED:
                // close socket or server 404 etc.
                // TODO: send event to streamID

              case protocol.RELAY_EXTEND_FAILED:
                // restart our socket building

            }
          } else {
            dstSock = mappings.getNodeToSocketMapping(destInfo.nid);
            // TODO: Fill out according to send msg
            protocol.sendRelay(dstSock, destInfo.circid, msgFields.stream_id, msgFields.relay_command, msgFields.body);
          }
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
