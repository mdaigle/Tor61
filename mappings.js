var circuit_map = {};
//var stream_to_host_map = {}; TODO: Needed?
var stream_to_client_map = {};
var node_to_socket_map = {};

var addNodeToSocketMapping(nid, socket) {
    //TODO: check for overwrites?
    node_to_socket_map[nid] = socket;
}

var getNodeToSocketMapping(nid) {
    return node_to_socket_map[nid];
}

function addCircuitMapping(srcID, srcCircID, destID, destCircID) {
    if (getCircuitMapping(srcID, srcCircID) != null) {
        throw "Duplicate mapping for source circuit id.";
    }
    if (getCircuitMapping(destID, destCircID) {
        throw "Duplicate mapping for destination circuit id.";
    }

    circuit_map[srcID][srcCircID] = {nid:destID, circid:destCircID};
    circuit_map[destID][destCircID] = {nid:srcID, circid:srcCircID};
}

function getCircuitMapping(srcID, srcCircID) {
    if (srcID in circuit_map) {
        if (srcCircID in circuit_map[srcID]) {
            return circuit_map[srcID][srcCircID];
        }
    }
    return null;
}

function addStreamToStreamMapping(srcID, srcCircID, srcStreamID, destID, destCircID, destStreamID) {
    if (getCircuitMapping(srcID, srcCircID) == null) {
        throw "Trying to map stream to stream, but this is the last node in the circuit.";
    }
    if (getCircuitMapping(destID, destCircID) == null) {
        throw "Trying to map stream to stream, but this is the first node in the circuit.";
    }
    circuit_map[srcID][srcCircID][srcStreamID] = destStreamID;
    circuit_map[destID][destCircID][destStreamID] = srcStreamID;
}

function getStreamToStreamMapping(srcID, srcCircID, srcStreamID) {
    if (getCircuitMapping(srcID, srcCircID) == null) {
        throw "Trying to get stream to stream mapping, but we don't have an appropriate circuit mapping.";
    }
    if (srcStreamID in circuit_map[srcID][srcCircID]) {
        return circuit_map[srcID][srcCircID][srcStreamID];
    }
    return null;
}

//TODO: DO WE NEED FOLLOWING TWO FUNCTIONS?
/*function addStreamToHostMapping(srcID, srcCircID, srcStreamID, _host, _hostPort) {
    if (getCircuitMapping(srcID, srcCircID) != null) {
        throw "Trying to get stream to host mapping, but we are not the last node in the circuit.";
    }

    if (getStreamToHostMapping(srcID, srcCircID, srcStreamID) != null) {
        throw "A mapping already exists for this stream.";
    }

    stream_to_host_map[srcID][srcCircID][srcStreamID] = {host:_host, hostPort:_hostPort};
}

function getStreamToHostMapping(srcID, srcCircID, srcStreamID) {
    if (srcID in stream_to_host_map) {
        if (srcCircID in stream_to_host_map[srcID]) {
            if (srcStreamID in stream_to_host_map[srcID][srcCircID]) {
                return stream_to_host_map[srcID][srcCircID][srcStreamID];
            }
        }
    }
    return null;
}*/

function addStreamToClientMapping(srcID, srcCircID, srcStreamID, clientSocket) {
    if (getCircuitMapping(srcID, srcCircID) != null) {
        throw "Trying to get stream to client mapping, but we are not the first node in the circuit.";
    }

    if (getStreamToClientMapping(srcID, srcCircID, srcStreamID) != null) {
        throw "A mapping already exists for this stream.";
    }

    stream_to_client_map[srcID][srcCircID][srcStreamID] = clientSocket;
}

function getStreamToClientMapping(srcID, srcCircID, srcStreamID) {
    if (srcID in stream_to_client_map) {
        if (srcCircID in stream_to_client_map[srcID]) {
            if (srcStreamID in stream_to_client_map[srcID][srcCircID]) {
                return stream_to_client_map[srcID][srcCircID][srcStreamID];
            }
        }
    }
    return null;
}
