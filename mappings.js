//A circuit that loops through us for each hop.
exports.BASE_CIRC_ID = 0;

var circuit_map = {};
var stream_to_socket_map = {};
var node_to_socket_map = {};

exports.addNodeToSocketMapping = function(nid, socket) {
    //TODO: check for overwrites?
    node_to_socket_map[nid] = socket;
}

exports.removeNodeToSocketMapping = function(nid) {
    if (nid in node_to_socket_map) {
        delete node_to_socket_map[nid];
    }
}

exports.getNodeToSocketMapping = function(nid) {
    return node_to_socket_map[nid];
}

exports.addCircuitMapping = function(srcID, srcCircID, destID, destCircID) {
    if (exports.getCircuitMapping(srcID, srcCircID) != null) {
        throw "Duplicate mapping for source circuit id.";
    }
    if (exports.getCircuitMapping(destID, destCircID) != null) {
        throw "Duplicate mapping for destination circuit id.";
    }

    if (!(srcID in circuit_map)) {
        circuit_map[srcID] = {};
    }

    circuit_map[srcID][srcCircID] = {nid:destID, circid:destCircID};
    if (destID != null && destCircID != null) {

        if (!(destID in circuit_map)) {
            circuit_map[destID] = {};
        }

        circuit_map[destID][destCircID] = {nid:srcID, circid:srcCircID};
    }
}

exports.removeCircuitMapping = function(nodeID, circID){
    if (nodeID in circuit_map) {
        if (circID != undefined && circID in circuit_map[nodeID]) {
            delete circuit_map[nodeID][circID];
        } else {
          delete circuit_map[nodeID];
        }
        //throw "Trying to delete circuit_id that's not in the map";
    }
    //throw "Trying to delete circuit_id from a node that's not in the map";
}


exports.getCircuitMapping = function(srcID, srcCircID) {
    if (srcID in circuit_map) {
        if (srcCircID in circuit_map[srcID]) {
            return circuit_map[srcID][srcCircID];
        }
    }
    return null;
}

/*exports.addStreamToStreamMapping = function(srcID, srcCircID, srcStreamID, destID, destCircID, destStreamID) {
    if (exports.getCircuitMapping(srcID, srcCircID) == null) {
        throw "Trying to map stream to stream, but this is the last node in the circuit.";
    }
    if (exports.getCircuitMapping(destID, destCircID) == null) {
        throw "Trying to map stream to stream, but this is the first node in the circuit.";
    }
    circuit_map[srcID][srcCircID][srcStreamID] = destStreamID;
    circuit_map[destID][destCircID][destStreamID] = srcStreamID;
}

exports.removeCircuitMapping(nodeID, circID) {
    if (nodeID in circuit_map) {
        if (circID in circuit_map[nodeID]) {
            delete circuit_map[nodeID][circID];
        }
        throw "Trying to delete circuit_id that's not in the map";
    }
    throw "Trying to delete circuit_id from a node that's not in the map";
}

exports.getStreamToStreamMapping = function(srcID, srcCircID, srcStreamID) {
    if (exports.getCircuitMapping(srcID, srcCircID) == null) {
        throw "Trying to get stream to stream mapping, but we don't have an appropriate circuit mapping.";
    }
    if (srcStreamID in circuit_map[srcID][srcCircID]) {
        return circuit_map[srcID][srcCircID][srcStreamID];
    }
    return null;
}*/

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

exports.addStreamToSocketMapping = function(srcID, srcCircID, srcStreamID, socket) {
    if (exports.getCircuitMapping(srcID, srcCircID) != null) {
        throw "Trying to get stream to client mapping, but we are not the first node in the circuit.";
    }

    if (exports.getStreamToSocketMapping(srcID, srcCircID, srcStreamID) != null) {
        throw "A mapping already exists for this stream.";
    }

    stream_to_socket_map[srcID][srcCircID][srcStreamID] = socket;
    //stream_to_socket_map[socket] = {nid: srcID, circid: srcCircID, streamid: srcStreamID};
}

exports.getStreamToSocketMapping = function(srcID, srcCircID, srcStreamID) {
    if (srcID in stream_to_socket_map) {
        if (srcCircID in stream_to_socket_map[srcID]) {
            if (srcStreamID in stream_to_socket_map[srcID][srcCircID]) {
                return stream_to_socket_map[srcID][srcCircID][srcStreamID];
            }
        }
    }
    return null;
}

exports.removeStreamToSocketMapping = function(srcID, srcCircID, srcStreamID) {
  if (srcID in stream_to_socket_map) {
    if (srcCircID in stream_to_socket_map[srcID]) {
      delete stream_to_socket_map[srcID][srcCircID][srcStreamID];
    }
  }
}
