/*When a browser connects, the header of the HTTP request is processed to identify the ip:port of the web server.

    A stream number, S, that is not in use on the source router's circuit is chosen.

    A Relay Begin cell is sent with circuit number C and stream number S. It also contains the ip:port of the web server.

    The last router on the circuit receives that cell and attempts to establish a TCP connection with the web server. If successful, it sends a Relay Connected cell back to the source router.*/


//TODO: close clientSocket if first_hop_socket closes or we get an end
var net = require('net');
var dns = require('dns');
var date = new Date();
var mappings = require('./mappings');
var protocol = require('./protocol');
var torutils = require('./torutils');

var stream_id_counter = 1;
function getNewStreamID() {
    return stream_id_counter++;
}

var server;

exports.startClientLoop = function(nid, proxyPort) {
    var first_hop_socket;
    var circuit_id = mappings.BASE_CIRC_ID;
    server = net.createServer(function (clientSocket) {
        var haveSeenEndOfHeader = false;
        var header = "";
        var stream_id = getNewStreamID();

        clientSocket.on('end', function() {
            if (mappings.BASE_CIRC_ID != 0) {
                torutils.sendWithoutPromise(protocol.sendRelay)(first_hop_socket, circuit_id, stream_id, protocol.RELAY_END, null);
            } else {
                first_hop_socket.end();
            }
        });

        clientSocket.on('error', function(err) {
            clientSocket.end();
            if (mappings.BASE_CIRC_ID != 0) {
                torutils.sendWithoutPromise(protocol.sendRelay)(first_hop_socket, circuit_id, stream_id, protocol.RELAY_END,     null);
            } else {
                first_hop_socket.end();
            }
        });

        // do we need to pass as an argument
        clientSocket.on('data', function (data, serverSock) {
            // console.log("Got client data.");
            if (!haveSeenEndOfHeader) {
                var dataString = data.toString('ascii');
                header += dataString;
                if (header.includes('\r\n\r\n') || header.includes('\n\n')) {
                    haveSeenEndOfHeader = true;
                    // pause the socket so that we can initiate a stream.
                    clientSocket.pause();
                    var trimmedHeader = header.split(/(\r\n\r\n|\n\n)/);
                    var headerLines = trimmedHeader[0].split(/[\r]?\n/);
                    var extraData = trimmedHeader[1];

                    // Take the first line and split it on white space
                    var requestLineComponents = headerLines.shift().trim().split(/\s+/);
                    if (requestLineComponents.length != 3) {
                        console.log("Malformed request line, invalid length");
                        clientSocket.end();
                        return;
                    }

                    var requestType = requestLineComponents[0].toUpperCase();
                    var requestURI = requestLineComponents[1];
                    var requestVersion = requestLineComponents[2].toUpperCase();

                    if (HTTP_METHODS.indexOf(requestType) == -1){
                        // Malformed request.
                        console.log("Malformed request line, method not valid");
                        clientSocket.end();
                        return;
                    }
                    if (requestVersion != "HTTP/1.1"){
                        // We only support 1.1
                        console.log("Unsupported version", requestVersion);
                        clientSocket.end();
                        return
                    }

                    logRequest(requestType, requestURI)

                    var optionMap = buildOptionMap(headerLines);

                    // Modify header fields
                    requestLineComponents[2] = "HTTP/1.0"
                    if ("connection" in optionMap) {
                        optionMap["connection"] = "close";
                    }
                    if ("proxy-connection" in optionMap) {
                        optionMap["proxy-connection"] = "close";
                    }


                    if (!("host" in optionMap)) {
                        // All 1.1 messages should have a host field
                        clientSocket.end();
                        return;
                    }
                    // Could ipv6 cause there to be multiple : in host?
                    var hostFieldComponents = optionMap.host.split(':');

                    var hostName = hostFieldComponents[0];
                    var hostPort = determineServerPort(hostFieldComponents, requestURI);

                    var modifiedHeader = buildHTTPHeader(requestLineComponents, optionMap);

                    dns.lookup(hostName, (err, address, family) => {
                        if (err) {
                            console.log('lookup failure');
                            // some sort of 404 or could not resolve
                            clientSocket.end();
                            return;
                        }
                        if (mappings.BASE_CIRC_ID == 0) {
                            first_hop_socket = net.createConnection({host:hostName, port:hostPort}, function() {
                                // console.log("connected to server");
                                clientSocket.resume();
                                // first_hop_socket.write(modifiedHeader);
                                if (requestType == "CONNECT") {
                                    var msg = "HTTP/1.1 200 OK\r\n\r\n";
                                    clientSocket.write(msg);

                                // console.log("HTTP CONNECT");
                                } else {
                                    first_hop_socket.write(modifiedHeader);
                                }
                            }.bind(this));
                            first_hop_socket.on("data", (data) => {
                            //    console.log("data!");
                               clientSocket.write(data);
                            });


                        } else {
                            // console.log("BASE CIRC ID is " + mappings.BASE_CIRC_ID);
                            circuit_mapping = mappings.getCircuitMapping(nid, mappings.BASE_CIRC_ID);
                            // console.log("Maps to " + circuit_mapping.nid);
                            first_hop_socket = mappings.getNodeToSocketMapping(circuit_mapping.nid);
                            // console.log("Which maps to socket " + first_hop_socket);
                            // console.log(first_hop_socket);
                            beginRelay(address, hostPort);
                        }

                        if (first_hop_socket == null) {
                            console.log("Got client data but first hop socket has been closed.");
                        }

                        first_hop_socket.on("error", (err) => {
                            //TODO: error handling
                            console.log("first hop sock err");
                            console.log(err);
                            if (mappings.BASE_CIRC_ID != 0) {
                              otherNode = mappings.getCircuitMapping(nid, mappings.BASE_CIRC_ID);
                              mappings.removeNodeToSocketMapping(otherNode.nid);
                              mappings.removeStreamToSocketMapping(stream_id);
                            }
                            first_hop_socket.end();
                            clientSocket.destroy();
                        });
                        first_hop_socket.on("close", () => {
                            clientSocket.end();
                            first_hop_socket.end();
                        })
                    });

                    function beginRelay(hostname, port) {
                        // Assign on msg based upon connection type Connect vs Get
                        // each callback should have a static definition (?)

                        var body = new Buffer(hostname + ":" + port + "\0");
                        // first_hop_socket.write(relay_begin_cell);

                        torutils.sendWithPromise(protocol.sendRelay,
                            function() { //success callback
                                // console.log("Stream successfully created");
                                // console.log(nid + ", " + circuit_id + ", " + stream_id);
                                // console.log(clientSocket);
                                var first_hop = mappings.getCircuitMapping(nid, circuit_id);
                                mappings.addStreamToSocketMapping(first_hop.nid, first_hop.circid, stream_id, clientSocket);
                                // console.log("Added stream to socket mapping");
                                //TODO: break up header before sending (if necessary)
                                if (requestType == "CONNECT") {
                                    var msg = "HTTP/1.1 200 OK\r\n\r\n";
                                    // console.log("About to send a 200");
                                    clientSocket.write(msg);
                                    // console.log("Sent 200 OK to client");
                                    first_hop_socket.on("error", function() {
                                        var msg = "HTTP/1.1 502 Bad Gateway\r\n\r\n";
                                        clientSocket.write(msg, function() {
                                            clientSocket.end();
                                        });
                                    });
                                } else {
                                    // console.log("Not a CONNECT");
                                    torutils.sendWithoutPromise(protocol.sendRelay)(first_hop_socket, circuit_id, stream_id, protocol.RELAY_DATA, data);
                                }
                                // Resume listening for data on client socket so
                                // that we can forward it along the new stream.
                                clientSocket.resume();
                            }.bind(this),
                            function () { //fail callback
                                var msg = "HTTP/1.1 502 Bad Gateway\r\n\r\n";
                                clientSocket.write(msg, function() {
                                    clientSocket.end();
                                });
                            }.bind(this))(first_hop_socket, circuit_id, stream_id, protocol.RELAY_BEGIN, body);
                      }
                }
            } else {
                if (mappings.BASE_CIRC_ID != 0) {
                    while (data.length > protocol.MAX_BODY_SIZE) {
                        smaller_data = data.slice(0, Math.min(protocol.MAX_BODY_SIZE, data.length));
                        torutils.sendWithoutPromise(protocol.sendRelay)(first_hop_socket, circuit_id, stream_id, protocol.RELAY_DATA, data);
                        data = data.slice(protocol.MAX_BODY_SIZE);
                    }
                    torutils.sendWithoutPromise(protocol.sendRelay)(first_hop_socket, circuit_id, stream_id, protocol.RELAY_DATA, data);
                } else {
                    // console.log("client data!");
                    first_hop_socket.write(data);
                }
            }
        });

    });

    server.on('error', (err) => {
        console.log("Client listening server error");
        console.log(err);
        process.exit(1);
        //TODO: try broadcasting to clients that we hit an error?
    })

    server.listen(proxyPort);

}
function buildOptionMap(lines) {
    var options = {};
    for (lineNum in lines) {
        var optionComponents = splitHeaderOptionString(lines[lineNum], ":");

        if (optionComponents == null) { continue; }

        var key = optionComponents[0].trim().toLowerCase();
        var value = optionComponents[1].trim();

        options[key] = value;
    }
    return options;
}

function splitHeaderOptionString(s, delim) {
    var index = s.indexOf(delim);
    if (index < 0) { return null;}
    return [s.substring(0, index), s.substring(index + 1, s.length)];
}

function buildHTTPHeader(requestLineComponents, optionMap) {
    var header = "";
    header += requestLineComponents.join(" ");
    header += "\r\n";
    for (var optionKey in optionMap) {
        header += optionKey + ": " + optionMap[optionKey] + "\r\n";
    }
    header += "\r\n";
    return header;
}

// Checks in the host field and uri for a port. If no port is found, returns 80.
function determineServerPort(hostFieldComponents, requestURI) {
    var serverPort = 80;
    if (hostFieldComponents.length == 1) {
        // Port not included in host field
        var portMatches = requestURI.match(/:[0-9]{1,5}/);
        if (portMatches != null) {
            serverPort = portMatches[0];
        }
    }else{
        // Pull port from host field
        serverPort = hostFieldComponents[1];
    }
    return serverPort;
}

function logRequest(method, uri) {
    var time = new Date();
    console.log(time + " >>> " + method.toUpperCase() + " " + uri);
};

const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "DELETE", "TRACE", "CONNECT"];
