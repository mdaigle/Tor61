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
require('buffer');
var net = require('net');
var mappings = require('./mappings');
var protocol = require('./protocol');
var serverloop = require('./serverloop');
var torutils = require('./torutils');


// Note: send functions that should use this include:
//  sendCreate
//  sendOpen
//  sendRelay
//
// Timeout callback should be function(){rej();}

exports.socketSetup = function(socket, nodeID, createdByUs) {
  if (!createdByUs) {
    openTimeout = setTimeout(function() {
      socket.end();
    }, protocol.TIMEOUT);
  }
  var msgMap = {};
  msgMap[protocol.OPEN] = msgMap[protocol.CREATE] = msgMap[protocol.RELAY] = {};
  msgMap[protocol.RELAY][protocol.RELAY_BEGIN] = msgMap[protocol.RELAY][protocol.EXTEND] = {};
  // each entry should be {resolve: , reject:, timeout:}
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
          mappings.addNodeToSocketMapping(msgFields,openerID, socket);
          if (protocol.OPEN in msgMap && msgMap[protocol.OPEN] != null) {
            msgMap[protocol.OPEN].resolve();
            clearTimeout(msgMap[protocol.OPEN].timeout);
            msgMap[protocol.OPEN] = null;
          }

        case protocol.OPEN_FAILED:
          // connecting to a node failed
          // either need to send an extend failed (?) or we failed to connect to
          // our first router
          if (protocol.OPEN in msgMap && msgMap[protocol.OPEN] != null) {
            msgMap[protocol.OPEN].reject();
            clearTimeout(msgMap[protocol.OPEN].timeout);
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
            msgMap[protocol.CREATE].resolve();
            clearTimeout(msgMap[protocol.CREATE].timeout);
            msgMap[protocol.CREATE] = null;
          }

        case protocol.CREATE_FAILED:
          // we failed. Either send an extend failed OR we failed to connect to
          // the first router in our circuit and need to restart
          // Need to know outstanding messages
          if (protocol.CREATE in msgMap && msgMap[protocol.CREATE] != null) {
            msgMap[protocol.CREATE].reject();
            clearTimeout(msgMap[protocol.CREATE].timeout);
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
          // DONE: add basecase circID -> null for our own circuit
          if (destInfo.nid == null || destInfo.circid == null) {
            // yay end node
            switch (msgFields.relay_cmd) {
              case protocol.RELAY_BEGIN:
                (new Promise(function(resolve, reject){
                  serverloop.initiateConnection(msgFields, otherNodeID, circID);
                })).then(function(){
                  torutils.sendWithoutPromise(protocol.sendRelay)(socket, circID, msgFields.stream_id, protocol.RELAY_CONNECTED, null);
                }).catch(function() {
                  torutils.sendWithoutPromise(protocol.sendRelay)(socket, circID, msgFields.stream_id, protocol.RELAY_BEGIN_FAILED, null);
                });
              case protocol.RELAY_DATA:
                // get streamID and find socket, forward data
                destSock = mappings.getStreamToSocketMapping(msgFields.stream_id);
                if (destSock) {
                  destSock.write(msgFields.body);
                }

              case protocol.RELAY_END:
                // remove mappings, close socket to server
                destSock = mappings.getStreamToSocketMapping(msgFields.stream_id);
                // TODO: send event to streamID if malcolm wants
                // TODO: streamIDs should be unique on a circuit
                destSock.end();
                mappings.removeStreamToSocketMapping(msgFields.stream_id);

              case protocol.RELAY_CONNECTED:
                // TODO: send event to streamID
                // TODO: event emitter should multiplex nodeID/circID and
                // streamID because streamIDs aren't unique globally
                if (msgMap[protocol.RELAY][protocol.RELAY_BEGIN][msgFields.stream_id]) {
                  msgMap[protocl.RELAY][protocol.RELAY_BEGIN][msgFields.stream_id].resolve();
                  clearTimeout(msgMap[protocol.RELAY][protocol.RELAY_BEGIN][msgFields.stream_id].timeout);
                }

              case protocol.RELAY_EXTEND:
                /*
                // TODO: if extending to self put mapping from circ to null
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
                */
              case protocol.RELAY_EXTENDED:
                // execute callback
                if (msgMap[protocol.RELAY][protocol.RELAY_EXTEND][msgFields.stream_id]) {
                  msgMap[protocol.RELAY][protocol.RELAY_EXTEND][msgFields.stream_id].resolve();
                  clearTimeout(msgMap[protocol.RELAY][protocol.RELAY_EXTEND][msgFields.stream_id].timeout);
                }

              case protocol.RELAY_BEGIN_FAILED:
                // close socket or server 404 etc.
                // TODO: send event to streamID
                if (msgMap[protocol.RELAY][protocol.RELAY_BEGIN][msgFields.stream_id]) {
                  msgMap[protocol.RELAY][protocol.RELAY_BEGIN][msgFields.stream_id].reject();
                  clearTimeout(msgMap[protocol.RELAY][protocol.RELAY_BEGIN][msgFields.stream_id].timeout)
                }

              case protocol.RELAY_EXTEND_FAILED:
                // restart our socket building
                if (msgMap[protocol.RELAY][protocol.RELAY_EXTEND][msgFields.stream_id]) {
                  msgMap[protocol.RELAY][protocol.RELAY_EXTEND][msgFields.stream_id].reject();
                  clearTimeout(msgMap[protocol.RELAY][protocol.RELAY_EXTEND][msgFields.stream_id].timeout)
                }

            }
          } else {
            dstSock = mappings.getNodeToSocketMapping(destInfo.nid);
            torutils.sendWithoutPromise(protocol.sendRelay)(dstSock, destInfo.circid, msgFields.stream_id, msgFields.relay_command, msgFields.body);
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
