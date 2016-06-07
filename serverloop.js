//  If either-end node:
//   should be using mapping from circID->streamID->socket_out
//   -> in separate asynchronous function
//   -> function/event loop should be mapped on a streamID

// when this socket or the other socket is closed teardown the stream
require('buffer');
var dns = require('dns');
var net = require('net');
var mappings = require('./mappings');
var protocol = require('./protocol');
var torutils = require('./torutils');

exports.initiateConnection = function(msgFields, otherNodeID, circID, resolve, reject) {
  var addrStr = msgFields.body.toString(undefined, 0, msgFields.body.length-1);
  var streamID = msgFields.stream_id;
  var addrSplit = addrStr.split(":"); // TODO: this may need work
  var hostName = addrSplit[0];
  var hostPort = addrSplit[1];
  var serverSocket = new net.Socket();

  function connectToServer(hostname, port) {
    // Assign on msg based upon connection type Connect vs Get
    // each callback should have a static definition (?)
    serverSocket.on("error", function() {
      // TODO: should clientloop send 502?
      console.log("server error");
      serverSocket.end();
      reject();
    });
    serverSocket.on("connect", function() {
      serverSocket.on('error', function() {
        // TODO: send relay end
        console.log("server error");
        var destSock = mappings.getNodeToSocketMapping(otherNodeID);
        torutils.sendWithoutPromise(protocol.sendRelay)(destSock, circID, streamID, protocol.RELAY_END, null);
        mappings.removeStreamToSocketMapping(otherNodeID, circID, streamID);
        // TODO: remove all stream/socket mappings
        serverSocket.end();
      });
      mappings.addStreamToSocketMapping(otherNodeID, circID, streamID, serverSocket);
      resolve();
    });
    serverSocket.on("data", function(data) {
      // forward data backwards
      //TODO: if we're the only node, don't relay, just send data
      console.log("in data");
      var destSock = mappings.getNodeToSocketMapping(otherNodeID);
      console.log("destsock");
      if (data.length <= protocol.MAX_BODY_SIZE) {
        console.log("small packet");
        torutils.sendWithoutPromise(protocol.sendRelay)(destSock, circID, streamID, protocol.RELAY_DATA, data);
        console.log("relayed");
      } else {
        console.log("big packet");
        var numBytesSent = 0;
        while (numBytesSent < data.length) {
          console.log("shrinking");
          segmentLength = Math.min(protocol.MAX_BODY_SIZE, data.length-numBytesSent);
          console.log("segement length");
          torutils.sendWithoutPromise(protocol.sendRelay)(destSock, circID, streamID, protocol.RELAY_DATA, data.slice(numBytesSent, numBytesSent + segmentLength));
          numBytesSent += segmentLength;
        }
      }
    });
    // Connect to Host/Port
    // console.log("connecting");
    serverSocket.connect(hostPort, hostName);
  }
  dns.lookup(hostName, (err, address, family) => {
    if (err) {
        console.log('lookup failure');
        reject();
        return;
    }
    // console.log("dns success");
    connectToServer(address, hostPort);
  });
}
