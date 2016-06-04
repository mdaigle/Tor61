// TODO:
//  If we don't get a response we do nothing unless we are the first node in
//  which case we send a Destroy message and rebuild
//  We only do this if we timeout in a control sequence
//  If the client closes a connection we assume the end server was
//  unreachable/timedout
//
//  TODO: handle socket errors nicely.
//
//  TODO: if we try to get a bad or missing mapping of any kind we should handle
//  appropriately (i.e. a node shut down and the circuit no longer exists we
//  should give up and if it is our circuit we should try to rebuild)
require('buffer');
var net = require('net');
var mappings = require('./mappings');
var protocol = require('./protocol');
var serverloop = require('./serverloop');
var torutils = require('./torutils');

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
  var teardown = function () {};
  var socketValidated = false;
  socket.on('data', function (data) {
    // buffer until 512 bytes
    // dataBuffer.append(data);
    dataBuffer = Buffer.concat([dataBuffer, data]);
    while (dataBuffer.length >= 512) {
      // process message
      // slice out current msg
      msg = dataBuffer.slice(0, 512);
      // check command, handle appropriately
      unpacked = unpackMainFields(msg);
      circID = unpacked.circuit_id;
      command = unpacked.cell_type;
      if (command < 0 || command > 8) {
        console.log("bad message");
        return;
      }
      msgFields = protocol.unpack(command, msg);
      // reassign teardown now that items are in scope
      teardown = function(){
        if (otherNodeID != null) {
          mappings.removeNodeToSocketMapping(otherNodeID); 
          if (circID != null && circID != 0) {
            mappings.removeCircuitMapping(otherNodeID);
          }
        }
        socket.end();
        if (protocol.OPEN in msgMap && "reject" in msgMap[protocol.OEPN]) {
          msgMap[protocol.OPEN].reject();
        }
        if (protocol.CREATE in msgMap) {
          for (var tempID in msgMap[protocol.CREATE]) {
            if ("reject" in msgMap[protocol.CREATE][tempID]) {
              msgMap[protocol.CREATE][tempID].reject();
            }
          }
        }
        if (protocol.RELAY in msgMap) {
          for (var relayCmd in msgMap[protocol.RELAY]) {
            for (var strID in msgMap[protocol.RELAY][relayCmd]) {
              if ("reject" in msgMap[protocol.RELAY][relayCmd][strID]) {
                msgMap[protocol.RELAY][relayCmd][strID].reject();
              }
            }
          }
        }
      };
      
      if (!socketValidated && (command != protocol.OPEN && command != protocol.OPENED && command != protocol.OPEN_FAILED)) {
        teardown();
        return;
      }
      switch(command) {
        case protocol.OPEN:
          clearTimeout(openTimeout);
          if (msgFields.opened_id != nodeID) {
            protocol.sendOpenFailed(socket, msgFields.opener_id, msgFields.opened_id);
          }
          mappings.addNodeToSocketMapping(msgFields.opener_id, socket);
          protocol.sendOpened(socket, msgFields.opener_id, msgFields.opened_id);
          if (!createdByUs) {
            socketValidated = true; 
          }
          otherNodeID = msgFields.opened_id;

        case protocol.OPENED:
          // circuit successfully added the first router
          // add nodeToSocketMapping
          // Or successfully added a new router
          if (createdByUs) {
            socketValidated = true;
          }
          mappings.addNodeToSocketMapping(msgFields.opened_id, socket);
          if (protocol.OPEN in msgMap && msgMap[protocol.OPEN] != null) {
            msgMap[protocol.OPEN].resolve();
            clearTimeout(msgMap[protocol.OPEN].timeout);
            delete msgMap[protocol.OPEN];
          }
          otherNodeID = msgFields.opened_id;

        case protocol.OPEN_FAILED:
          // connecting to a node failed
          // either need to send an extend failed (?) or we failed to connect to
          // our first router
          if (protocol.OPEN in msgMap && msgMap[protocol.OPEN] != null) {
            msgMap[protocol.OPEN].reject();
            clearTimeout(msgMap[protocol.OPEN].timeout);
            delete msgMap[protocol.OPEN];
          }

        case protocol.CREATE:
          // add mapping and send created
          mappings.addCircuitMapping(otherNodeID, circID, null, null);
          protocol.sendCreated(socket, circID);

        case protocol.CREATED:
          // mapping successful
          mappings.addCircuitMapping(otherNodeID, circID, null, null);
          if (protocol.CREATE in msgMap && msgMap[protocol.CREATE] != null) {
            msgMap[protocol.CREATE][circID].resolve();
            clearTimeout(msgMap[protocol.CREATE][circID].timeout);
            delete msgMap[protocol.CREATE][circID];
          }

        case protocol.CREATE_FAILED:
          // we failed. Either send an extend failed OR we failed to connect to
          // the first router in our circuit and need to restart
          if (protocol.CREATE in msgMap && msgMap[protocol.CREATE] != null) {
            msgMap[protocol.CREATE][circID].reject();
            clearTimeout(msgMap[protocol.CREATE][circID].timeout);
            delete msgMap[protocol.CREATE][circID];
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
                destSock = mappings.getStreamToSocketMapping(otherNodeID, circID, msgFields.stream_id);
                if (destSock) {
                  destSock.write(msgFields.body);
                }

              case protocol.RELAY_END:
                // remove mappings, close socket to server
                destSock = mappings.getStreamToSocketMapping(otherNodeID, circID, msgFields.stream_id);
                destSock.end();
                mappings.removeStreamToSocketMapping(otherNodeID, circID, msgFields.stream_id);

              case protocol.RELAY_CONNECTED:
                // TODO: can't just publish to streamID because not globally
                // unique
                if (msgMap[protocol.RELAY][protocol.RELAY_BEGIN][msgFields.stream_id]) {
                  msgMap[protocl.RELAY][protocol.RELAY_BEGIN][msgFields.stream_id].resolve();
                  clearTimeout(msgMap[protocol.RELAY][protocol.RELAY_BEGIN][msgFields.stream_id].timeout);
                }

              case protocol.RELAY_EXTEND:
                // TODO: parse host and port
                // TODO: make parseString in torutils
                var nodeFields = protocol.parseNodeAddr(msgFields.body);
                var newHost = nodeFields.ip;
                var newPort = nodeFields.port;
                var newID = nodeFields.agent_id;
                if (newID == nodeID) {
                  mappings.addCircuitMapping(otherNodeID, circID, null, null);
                  torutils.sendWithoutPromise(protocol.sendRelay)(socket, circID, 0, protocol.RELAY_EXTENDED, null);
                } else {
                  var newCircID = torutils.generateCircID((mapings.getNodeToSocketMapping(newID) == null));
                  torutils.createFirstHop(newNost, newPort, nodeID, newID, function() {
                    mappings.addCircuitMapping(otherNodeID, circID, newID, newCircID);
                    torutils.sendWithoutPromise(protocol.sendRelay)(socket, circID, 0, protocol.RELAY_EXTENDED, null);
                  }, function() {
                    torutils.sendWithoutPromise(protocol.sendRelay)(responseSock, circID, 0, protocol.RELAY_EXTEND_FAILED, null);
                  });
                }
                
              case protocol.RELAY_EXTENDED:
                // execute callback
                if (msgMap[protocol.RELAY][protocol.RELAY_EXTEND][msgFields.stream_id]) {
                  msgMap[protocol.RELAY][protocol.RELAY_EXTEND][msgFields.stream_id].resolve();
                  clearTimeout(msgMap[protocol.RELAY][protocol.RELAY_EXTEND][msgFields.stream_id].timeout);
                }

              case protocol.RELAY_BEGIN_FAILED:
                // close socket or server 404 etc.
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
    teardown();
    socket.end();
  });
  socket.on('error', function() {
    teardown();
    socket.end();
  );
}
