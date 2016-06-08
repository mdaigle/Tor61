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
  // console.log("setting up socket");
  if (!createdByUs) {
    openTimeout = setTimeout(function() {
      socket.end();
    }, protocol.TIMEOUT);
  }
  var msgMap = {"test": true};
  msgMap[protocol.OPEN] = {};
  msgMap[protocol.CREATE] = {};
  msgMap[protocol.RELAY] = {};
  msgMap[protocol.RELAY][protocol.RELAY_BEGIN] = {};
  msgMap[protocol.RELAY][protocol.RELAY_EXTEND] = {};
  //console.log("BASE MAP");
  //console.log(socket.UUID);
  //console.log(msgMap);

  // each entry should be {resolve: , reject:, timeout:}
  socket["msgMap"] = msgMap;
  Object.observe(socket.msgMap[protocol.CREATE], function(changes) {
   // console.log(socket.UUID);
   // console.log("================================================");
   // console.log(changes);
  });
  Object.observe(msgMap[protocol.CREATE], function(changes) {
   // console.log("++++++++++++++++++++++++++++++++++++++++++++++++");
   // console.log(changes);
   // console.log(msgMap);
  });
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
      var msg = dataBuffer.slice(0, 512);
      // check command, handle appropriately
      var unpacked = protocol.unpackMainFields(msg);
      var circID = unpacked.circuit_id;
      var command = unpacked.cell_type;
    //   console.log("received: " + command);
      if (command < 0 || command > 8) {
        console.log("bad message");
        return;
      }
      var msgFields = protocol.unpack(command, msg);
      // reassign teardown now that items are in scope
      teardown = function(){
        if (otherNodeID != null) {
          mappings.removeNodeToSocketMapping(otherNodeID);
          var circuits = mappings.getAllCircuitMappings(otherNodeID);
          if (circuits != null) {
              circuits.forEach(function(elt, i){
                  elt = parseInt(elt);
                  tempInfo = mappings.getCircuitMapping(otherNodeID, elt);
                  mappings.removeCircuitMapping(otherNodeID, elt);
                  mappings.removeCircuitMapping(tempInfo.nid, tempInfo.circid);
                  if (tempInfo != null && tempInfo.nid != null && tempInfo.circid != null) {
                      tempSock = mappings.getNodeToSocketMapping(otherNodeID);
                      if (tempSock && tempSock.writable) {
                          protocol.sendDestroy(tempSock, elt);
                      }
                  }
              });
            }

          if (circID != null && circID != 0) {
            mappings.removeCircuitMapping(otherNodeID, circID);
          }
        }

        /*if (protocol.OPEN in msgMap && "reject" in msgMap[protocol.OPEN]) {
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
      }*/
      };

      if (!socketValidated && (command != protocol.OPEN && command != protocol.OPENED && command != protocol.OPEN_FAILED)) {
        return;
      }
      switch(command) {
        case protocol.OPEN:
            console.log("<<< Received OPEN from " + msgFields.opener_id);
            clearTimeout(openTimeout);
            if (msgFields.opened_id != nodeID) {
                protocol.sendOpenFailed(socket, msgFields.opener_id, msgFields.opened_id);
            }
            mappings.addNodeToSocketMapping(msgFields.opener_id, socket);
            protocol.sendOpened(socket, msgFields.opener_id, msgFields.opened_id);
            if (!createdByUs) {
                socketValidated = true;
                // add mapping false
                mappings.addCircIDPartition(msgFields.opener_id, false);
            }
            otherNodeID = msgFields.opener_id;
            break;

        case protocol.OPENED:
            console.log("<<< Received OPENED from " + msgFields.opened_id);
          // circuit successfully added the first router
          // add nodeToSocketMapping
          // Or successfully added a new router
          if (createdByUs) {
            socketValidated = true;
            // add mapping true
            mappings.addCircIDPartition(msgFields.opened_id, true);
          }
          mappings.addNodeToSocketMapping(msgFields.opened_id, socket);
          if (protocol.OPEN in msgMap && msgMap[protocol.OPEN] != null) {
            //console.log(socket.msgMap);
            //console.log(socket.UUID);
            // console.log(msgMap);
            msgMap[protocol.OPEN].resolve();
            clearTimeout(msgMap[protocol.OPEN].timeout);
            delete msgMap[protocol.OPEN];
          }
          otherNodeID = msgFields.opened_id;
        //   console.log("Other node id: " + otherNodeID);
          break;

        case protocol.OPEN_FAILED:
            console.log("<<< Received OPEN_FAILED from " + msgFields.opener_id);
          // connecting to a node failed
          // either need to send an extend failed (?) or we failed to connect to
          // our first router
          if (protocol.OPEN in msgMap && msgMap[protocol.OPEN] != null) {
            msgMap[protocol.OPEN].reject();
            clearTimeout(msgMap[protocol.OPEN].timeout);
            delete msgMap[protocol.OPEN];
          }
          break;

        case protocol.CREATE:
            console.log("<<< Received CREATE " + circID + " from " + otherNodeID);
          // add mapping and send created
          mappings.addCircuitMapping(otherNodeID, circID, null, null);
          protocol.sendCreated(socket, circID);
          break;

        case protocol.CREATED:
            console.log("<<< Received CREATED " + circID + " from " + otherNodeID);
          // mapping successful
        //   console.log("received created on " + circID);
        //   mappings.addCircuitMapping(otherNodeID, circID, nodeID, circID);
        //   mappings.addCircuitMapping(nodeID, circID, otherNodeID, circID);
          if (protocol.CREATE in msgMap && msgMap[protocol.CREATE] != null) {
            // console.log(socket.UUID);
            // console.log(msgMap);
            console.log("About to resolve create");
            msgMap[protocol.CREATE][circID].resolve();
            console.log("Resolved create");
            clearTimeout(msgMap[protocol.CREATE][circID].timeout);
            delete msgMap[protocol.CREATE][circID];
          }
          break;

        case protocol.CREATE_FAILED:
            console.log("<<< Received CREATE_FAILED " + circID + " from " + otherNodeID);
          // we failed. Either send an extend failed OR we failed to connect to
          // the first router in our circuit and need to restart
          if (protocol.CREATE in msgMap && msgMap[protocol.CREATE] != null) {
            msgMap[protocol.CREATE][circID].reject();
            clearTimeout(msgMap[protocol.CREATE][circID].timeout);
            delete msgMap[protocol.CREATE][circID];
          }
          break;

        case protocol.DESTROY:
            console.log("<<< Received DESTROY " + circID + " from " + otherNodeID);
          destInfo = mappings.getCircuitMapping(otherNodeID, circID);
          otherSock = mappings.getNodeToSocketMapping(destInfo.nid);
          protocol.sendDestroy(otherSock, destInfo.circid);
          mappings.removeCircuitMapping(otherNodeID, circID);
          mappings.removeCircuitMapping(destInfo.nid, destInfo.circid);
          break;

        case protocol.RELAY:
            // console.log("<<< Received RELAY " + msgFields.relay_command + " on " + circID + " from " + otherNodeID);
          // check if end node
          destInfo = mappings.getCircuitMapping(otherNodeID, circID);
          // DONE: add basecase circID -> null for our own circuit
          if (destInfo == null || destInfo.nid == null || destInfo.circid == null) {
            // yay end node
            // console.log("YAY END NODE");
            switch (msgFields.relay_command) {
              case protocol.RELAY_BEGIN:
                (new Promise(function(resolve, reject){
                  serverloop.initiateConnection(msgFields, otherNodeID, circID, resolve, reject);
                })).then(function(){
                  torutils.sendWithoutPromise(protocol.sendRelay)(socket, circID, msgFields.stream_id, protocol.RELAY_CONNECTED, null);
                }).catch(function() {
                  torutils.sendWithoutPromise(protocol.sendRelay)(socket, circID, msgFields.stream_id, protocol.RELAY_BEGIN_FAILED, null);
                });
                break;
              case protocol.RELAY_DATA:
                // console.log("IN RELAY_DATA");
                // get streamID and find socket, forward data
                destSock = mappings.getStreamToSocketMapping(otherNodeID, circID, msgFields.stream_id);
                // console.log("GOT MAPPING: ");
                // console.log(destSock);
                // console.log(msgFields.body);
                if (destSock) {
                //   console.log("PREPARING TO WRITE");
                  destSock.write(msgFields.body);
                //   console.log("WROTE");
                } else {
                    console.log("can't find destination socket for data relay");
                }
                break;

              case protocol.RELAY_END:
                // remove mappings, close socket to server
                // console.log(otherNodeID + ", " + circID + ", " + msgFields.stream_id);
                // destSock = mappings.getStreamToSocketMapping(otherNodeID, circID, msgFields.stream_id);
                // destSock.end();
                mappings.removeStreamToSocketMapping(otherNodeID, circID, msgFields.stream_id);
                break;

              case protocol.RELAY_CONNECTED:
                // TODO: can't just publish to streamID because not globally
                // unique
                if (msgMap[protocol.RELAY][protocol.RELAY_BEGIN][msgFields.stream_id]) {
                    // console.log("Resolving begin request");
                  msgMap[protocol.RELAY][protocol.RELAY_BEGIN][msgFields.stream_id].resolve();
                  clearTimeout(msgMap[protocol.RELAY][protocol.RELAY_BEGIN][msgFields.stream_id].timeout);
                }
                break;

              case protocol.RELAY_EXTEND:
                // TODO: parse host and port
                // TODO: make parseString in torutils
                var nodeFields = protocol.parseNodeAddr(msgFields.body);
                // console.log(nodeFields);
                var newHost = nodeFields.ip;
                var newPort = nodeFields.port;
                var newID = nodeFields.agent_id;
                // console.log("received extend");
                if (newID == nodeID) {
                //   console.log("Extending to self");
                //   mappings.addCircuitMapping(otherNodeID, circID, null, null);
                    torutils.sendWithoutPromise(protocol.sendRelay)(socket, circID, 0, protocol.RELAY_EXTENDED, null);
                } else {
                    //TODO: look at first mapping
                  var newCircID = torutils.generateCircID(mappings.getCircIDPartition(newID));
                  torutils.createFirstHop(newHost, newPort, nodeID, newID, newCircID, function() {
                    //   console.log("Hit the extend callback");
                    mappings.addCircuitMapping(otherNodeID, circID, newID, newCircID);
                    // console.log("Added forward extend mapping.");
                    mappings.addCircuitMapping(newID, newCircID, otherNodeID, circID);
                    // console.log("Added reverse extend mapping.");
                    torutils.sendWithoutPromise(protocol.sendRelay)(socket, circID, 0, protocol.RELAY_EXTENDED, null);
                    // console.log("Sent extended without promise");
                  }.bind(this), function() {
                    torutils.sendWithoutPromise(protocol.sendRelay)(responseSock, circID, 0, protocol.RELAY_EXTEND_FAILED, null);
                  }.bind(this));
                }
                break;

              case protocol.RELAY_EXTENDED:
                // execute callback
                if (msgMap[protocol.RELAY][protocol.RELAY_EXTEND][msgFields.stream_id]) {
                  msgMap[protocol.RELAY][protocol.RELAY_EXTEND][msgFields.stream_id].resolve();
                  clearTimeout(msgMap[protocol.RELAY][protocol.RELAY_EXTEND][msgFields.stream_id].timeout);
                }
                break;

              case protocol.RELAY_BEGIN_FAILED:
                console.log("<<< Received RELAY " + msgFields.relay_command + " on " + circID + " from " + otherNodeID);

                // close socket or server 404 etc.
                if (msgMap[protocol.RELAY][protocol.RELAY_BEGIN][msgFields.stream_id]) {
                  msgMap[protocol.RELAY][protocol.RELAY_BEGIN][msgFields.stream_id].reject();
                  clearTimeout(msgMap[protocol.RELAY][protocol.RELAY_BEGIN][msgFields.stream_id].timeout)
                }
                break;

              case protocol.RELAY_EXTEND_FAILED:
                console.log("<<< Received RELAY " + msgFields.relay_command + " on " + circID + " from " + otherNodeID);

                // restart our socket building
                if (msgMap[protocol.RELAY][protocol.RELAY_EXTEND][msgFields.stream_id]) {
                  msgMap[protocol.RELAY][protocol.RELAY_EXTEND][msgFields.stream_id].reject();
                  clearTimeout(msgMap[protocol.RELAY][protocol.RELAY_EXTEND][msgFields.stream_id].timeout)
                }
                break;
            }
          } else {
            dstSock = mappings.getNodeToSocketMapping(destInfo.nid);
            torutils.sendWithoutPromise(protocol.sendRelay)(dstSock, destInfo.circid, msgFields.stream_id, msgFields.relay_command, msgFields.body);
          }
          break;
      }
      // processed dataBuffer
      dataBuffer = Buffer(dataBuffer.slice(512, dataBuffer.length));
    }
  });
  socket.on('close', function() {
    // teardown any pertinent
    teardown();
    socket.end();
  });
  socket.on('error', function(err) {
      console.log("Socket Error", err);
  });
}
