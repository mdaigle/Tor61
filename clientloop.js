// TODO: Malcolm, do all send functions using
// routerloop.sendWithPromise/sendWithoutPromise(protocol.sendRelay)

// Event loop for client socket
//  similar to proxy event loop
//  once ready, map streamID->socket_out

//TODO: Put this bit at the beginning of tor61 file.
/*
const EventEmitter = require("events").EventEmitter;
global.emitter = new EventEmitter();
clientloop = require("./clientloop.js");
*/

/*When a browser connects, the header of the HTTP request is processed to identify the ip:port of the web server.

    A stream number, S, that is not in use on the source router's circuit is chosen.

    A Relay Begin cell is sent with circuit number C and stream number S. It also contains the ip:port of the web server.

    The last router on the circuit receives that cell and attempts to establish a TCP connection with the web server. If successful, it sends a Relay Connected cell back to the source router.*/

var net = require('net');
var dns = require('dns');
var date = new Date();
var mapping = require('./mappings');
var protocol = require('./protocol');

//TODO: Calculate node id using tor utils and make it globally accessible.
var nid = 1;
//TODO: replace with actual first hop socket from circuit we create.
var first_hop_socket = new net.Socket() //placeholder
//TODO: replace with actual circuit id
var circuit_id = 1; //placeholder

var stream_id_counter = 1;
function getNewStreamID() {
    return stream_id_counter++;
}

//TODO: move below argument processing to main file. Set client facing port as a global.
var args = process.argv.slice(2);
if (args.length != 1) {
    console.log("Incorrect number of arguments.");
    process.exit(1);
}
var clientFacingPort = args[0];

var server = net.createServer(function (clientSocket) {
    var haveSeenEndOfHeader = false;
    var header = "";
    var stream_id = getNewStreamID();

    clientSocket.on('end', function() {
        torutils.sendWithoutPromise(protocol.sendRelay(first_hop_socket, circuit_id, stream_id, RELAY_END, null))
    });
    clientSocket.on('error', function(err) {
        clientSocket.end();
        torutils.sendWithoutPromise(protocol.sendRelay(first_hop_socket, circuit_id, stream_id, RELAY_END, null))
    });

    // do we need to pass as an argument
    clientSocket.on('data', function (data, serverSock) {
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

                dns.lookup(hostName, (err, address, family) => {
                    if (err) {
                        console.log('lookup failure');
                        // some sort of 404 or could not resolve
                        clientSocket.end();
                        return;
                    }
                    beginRelay(address, hostPort);
                });

                function beginRelay(hostname, port) {
                    // Assign on msg based upon connection type Connect vs Get
                    // each callback should have a static definition (?)

                    var body = new Buffer(hostname + ":" + port + "\0");
                    var relay_begin_cell = protocol.packRelay(circuit_id, stream_id, protocol.RELAY_BEGIN, body);
                    console.log(relay_begin_cell.toString());
                    // first_hop_socket.write(relay_begin_cell);

                    torutils.sendWithPromise(protocol.sendRelay(first_hop_socket, circuit_id, stream_id, RELAY_BEGIN, null), function() {

                            // Map from identifiers to this socket so that
                            // the main loop can route data cells coming
                            // from the network.
                            mappings.addStreamToSocketMapping(nid, _circuit_id, _stream_id, clientSocket);
                            // This is the response for the stream we began
                            //TODO: break up header before sending (if necessary)
                            if (requestType == "CONNECT") {
                                //TODO: send 200 to client here?
                                var msg = "HTTP/1.1 200 OK\r\n\r\n";
                                clientSocket.write(msg);
                                first_hop_socket.on("error", function() {
                                    // send 502 bad gateway
                                    var msg = "HTTP/1.1 502 Bad Gateway\r\n\r\n";
                                    clientSocket.write(msg, function() {
                                        clientSocket.end();
                                    });
                                });
                            } else {
                                var modifiedHeader = buildHTTPHeader(requestLineComponents, optionMap);
                                first_hop_socket.write(modifiedHeader + extraData);
                            }
                                // Resume listening for data on client socket so
                                // that we can forward it along the new stream.
                            clientSocket.resume();
                        },
                        function () { //fail callback
                            var msg = "HTTP/1.1 502 Bad Gateway\r\n\r\n";
                            clientSocket.write(msg, function() {
                                clientSocket.end();
                            });
                        });
            }
        } else {
            // Forward data along circuit
            // 498 is 512 byte cell size minus 14 bytes for cell header.
            while (data.length > protocol.MAX_BODY_SIZE) {
                var body = data.slice(0, protocol.MAX_BODY_SIZE - 1);
                var relay_data_cell = protocol.packRelay(circuit_id, stream_id, RELAY_DATA, body);
                first_hop_socket.write(relay_data_cell);
                data = Buffer.from(data, protocol.MAX_BODY_SIZE);
            }
            var relay_data_cell = protocol.packRelay(circuit_id, stream_id, RELAY_DATA, body);
            first_hop_socket.write(relay_data_cell);
        }
    });

});

server.on('error', (err) => {
    console.log("Server error");
    process.exit(1);
    //TODO: try broadcasting to clients that we hit an error?
})

server.listen(clientFacingPort);

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
