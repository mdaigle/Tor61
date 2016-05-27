const crypto = require('crypto');

exports.generateNodeID = function(ip, port) {
    //TODO: legit hash at some point?
    /*var components = ip.split('.');
    for (var i = 0; i < components.length; i++) {
        message_buffer.writeUInt8(parseInt(components[i]), 4 + i);
    }*/
    bytes = crypto.randomBytes(4);
    return bytes.readUInt32BE(0);
}

Object.freeze(exports);
