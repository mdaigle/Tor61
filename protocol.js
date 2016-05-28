// CELL-LEVEL COMMANDS
exports.CREATE = CREATE = 1;
exports.CREATED = CREATED = 2;
exports.RELAY = RELAY = 3;
exports.DESTROY = DESTROY = 4;
exports.OPEN = OPEN = 5;
exports.OPENED = OPENED = 6;
exports.OPEN_FAILED = OPEN_FAILED = 7;
exports.CREATE_FAILED = CREATE_FAILED = 8;

// RELAY COMMANDS
exports.RELAY_BEGIN = RELAY_BEGIN = 1;
exports.RELAY_DATA = RELAY_DATA = 2;
exports.RELAY_END = RELAY_END = 3;
exports.RELAY_CONNECTED = RELAY_CONNECTED = 4;
exports.RELAY_EXTEND = RELAY_EXTEND = 6;
exports.RELAY_EXTENDED = RELAY_EXTENDED = 7;
exports.RELAY_BEGIN_FAILED  = RELAY_BEGIN_FAILED = 11;
exports.RELAY_EXTEND_FAILED = RELAY_EXTEND_FAILED = 12;

exports.packMainFields = function(circuit_id, command, message_buffer) {
    message_buffer = message_buffer || new Buffer(512);

    message_buffer.writeUInt16BE(circuit_id, 0);
    message_buffer.writeUInt8(command, 2);

    message_buffer.fill(0, 3);

    return message_buffer;
}

exports.packCreate = function(circuit_id) {
    return packMainFields(circuit_id, CREATE);
}

exports.packCreated = function(circuit_id) {
    return packMainFields(circuit_id, CREATED);
}

exports.packDestroy = function(circuit_id) {
    return packMainFields(circuit_id, DESTROY);
}

exports.packOpen = function(sender_id, receiver_id) {
    message_buffer = new Buffer(512);
    message_buffer = packMainFields(0, OPEN, message_buffer);

    message_buffer.writeUInt32BE(sender_id, 3);
    message_buffer.writeUInt32BE(receiver_id, 7);

    return message_buffer;
}

exports.packOpened = function(sender_id, receiver_id) {
    message_buffer = new Buffer(512);
    message_buffer = packMainFields(0, OPENED, message_buffer);

    // Same as an open, so ids should stay in same order
    message_buffer.writeUInt32BE(receiver_id, 3);
    message_buffer.writeUInt32BE(sender_id, 7);

    return message_buffer;
}

exports.packOpenFailed = function(sender_id, receiver_id) {
    message_buffer = new Buffer(512);
    message_buffer = packMainFields(0, OPEN_FAILED, message_buffer);

    // Same as an open, so ids should stay in same order
    message_buffer.writeUInt32BE(receiver_id, 3);
    message_buffer.writeUInt32BE(sender_id, 7);

    return message_buffer;
}

exports.packCreateFailed = function(circuit_id) {
    return packMainFields(circuit_id, CREATE_FAILED);
}

// Body parameter should be a buffer.
exports.packRelay = function(circuit_id, stream_id, relay_command, body) {
    body_length = body.length;
    message_buffer = new Buffer(512);

    message_buffer = packMainFields(circuit_id, RELAY, message_buffer);

    message_buffer.writeUInt16BE(stream_id, 3);
    message_buffer.writeUInt16BE(0, 5); // Empty here. Don't know why.
    message_buffer.writeUInt32BE(0, 7); // Digest would go here.
    message_buffer.writeUInt16BE(body_length, 11);
    message_buffer.writeUInt8(relay_command, 13);
    // Copy body over to message buffer
    body.copy(message_buffer, 14, 0, body_length);

    return message_buffer;
}

Object.freeze(exports);
