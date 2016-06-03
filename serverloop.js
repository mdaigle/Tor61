//  If either-end node:
//   should be using mapping from circID->streamID->socket_out
//   -> in separate asynchronous function
//   -> function/event loop should be mapped on a streamID

// when this socket or the other socket is closed teardown the stream
  
function initiateConnection(msgFields, otherNodeID, circID, resolve, reject) {
  var addrStr = parseString(msgFields.body);
  var streamID = msgFields.stream_id;
  var addrSplit = addrStr.split(":");
  var hostname = addrSplit[0];
  var port = addrSplit[1];
  var serverSocket = net.Socket();

  function connectToServer(hostname, port) {
    // Assign on msg based upon connection type Connect vs Get
    // each callback should have a static definition (?)
    serverSocket.on("error", function() {
      // TODO: should clientloop send 502?
      serverSocket.end();
      reject();
    });
    serverSocket.on("connect", function() {
      serverSocket.on('error', function() {
        // TODO: send relay end
        // TODO: remove all stream/socket mappings
        serverSocket.end();
      });
      // TODO: add stream/socket mapping
      resolve();
    });
    serverSocket.on("data", function(data) {
      // forward data backwards
      var destSock = mappings.getNodeToSocketMapping(otherNodeID);
      // TODO: pack a relay Data msg
      var msg = null;
      destSock.write(msg);
    });
    // Connect to Host/Port
    serverSocket.connect(hostPort, hostName);
  }
  dns.lookup(hostname, (err, address, family) => {
    if (err) {
        console.log('lookup failure');
        reject();
        return;
    }
    connectToServer(address, hostPort); 
  });
}
