// Protocol constants
exports.MAGIC = MAGIC         = 0xC461;
exports.REGISTER = REGISTER      = 1;
exports.REGISTERED = REGISTERED    = 2;
exports.FETCH = FETCH         = 3;
exports.FETCHRESPONSE = FETCHRESPONSE = 4;
exports.UNREGISTER = UNREGISTER    = 5;
exports.PROBE = PROBE         = 6;
exports.ACK = ACK           = 7;

// Packs the main message fields (magic, sequence number, and command) in the
// given buffer.
exports.packMainFields = packMainFields = function(seq_num, command, message_buffer) {
    message_buffer = message_buffer || new Buffer(4);

    message_buffer.writeUInt16BE(MAGIC, 0);
    message_buffer.writeUInt8(seq_num, 2);
    message_buffer.writeUInt8(command, 3);

    return message_buffer;
}

// Unpacks the main fields from a message (magic number, sequence number,
// and command).
exports.unpackMainFields = unpackMainFields = function(message_buffer) {
    if (message_buffer.length < 4) { return null; }

    return {
        magic: message_buffer.readUInt16BE(0),
        seq_num: message_buffer.readUInt8(2),
        command: message_buffer.readUInt8(3),
    }
}

// Packs a new message with the requisite fields for a REGISTER.
exports.packRegister = function(seq_num, ip, port, service_data, service_name) {
    var message_buffer = Buffer(15 + service_name.length);
    name_len = service_name.length;

    packMainFields(seq_num, REGISTER, message_buffer);

    // Write address bytes individually because ip comes in as a string.
    var components = ip.split('.');
    for (var i = 0; i < components.length; i++) {
        message_buffer.writeUInt8(parseInt(components[i]), 4 + i);
    }

    message_buffer.writeUInt16BE(port, 8);
    message_buffer.writeUInt32BE(service_data, 10);
    message_buffer.writeUInt8(name_len, 14);
    message_buffer.write(service_name, 15);

    return message_buffer;
}

// Unpacks field from a REGISTERED message. Assumes that message_buffer has
// already been checked for validity.
exports.unpackRegistered = function(message_buffer) {
    //Verify that message is of the expected length.
    // console.log(message_buffer.length);
    // console.log(message_buffer);
    if (message_buffer.length != 6) { return null; }

    var message = unpackMainFields(message_buffer);
    message.lifetime = message_buffer.readUInt16BE(4);

    return message;
}

// Packs the fields for an UNREGISTER message into a buffer and returns this
// buffer.
exports.packUnregister = function(seq_num, ip, port) {
    var message_buffer = new Buffer(10);

    packMainFields(seq_num, UNREGISTER, message_buffer);
    var components = ip.split('.');
    for (var i = 0; i < components.length; i++) {
        message_buffer.writeUInt8(parseInt(components[i]), 4 + i);
    }
    message_buffer.writeUInt16BE(port, 8);

    return message_buffer;
}

// Packs the fields for a FETCH message into a buffer and returns this buffer.
// Service name parameter specifies describes the local service.
exports.packFetch = function(seq_num, service_name){
    var name_len = service_name.length;
    var message_buffer = Buffer(5 + name_len);

    packMainFields(seq_num, FETCH, message_buffer);
    // really should check that name_len < 255
    message_buffer.writeUInt8(name_len, 4);
    message_buffer.write(service_name, 5, name_len);

    return message_buffer;
}

// Unpacks the fields from a FETCHRESPONSE message.
exports.unpackFetchResponse = function(message_buffer) {
    if (message_buffer.length < 5 || (message_buffer.length - 5) % 10 != 0) {
        return null;
    }

    var msg = unpackMainFields(message_buffer);
    msg.num_entries = message_buffer.readUInt8(4);
    msg.entries = [];

    for (i = 0; i < msg.num_entries; i++) {
        var entry_offset = 5 + (10 * i);

        var entry = {
            service_addr: {
                address: message_buffer.readUInt32BE(entry_offset),
                port: message_buffer.readUInt16BE(entry_offset + 4),
            },
            service_data: message_buffer.readUInt32BE(entry_offset + 6)
        };
        console.log("service_data: " + entry.service_data);

        msg.entries.push(entry);
    }

    return msg;
}

// Packs the fields for a PROBE message into a buffer and returns this buffer.
exports.packProbe = function(seq_num) {
    return packMainFields(seq_num, PROBE);
}

// Packs the fields for an ACK message into a buffer and returns this buffer.
exports.packAck = function(seq_num) {
    return packMainFields(seq_num, ACK);
}


// IMPORTANT! - keeps the protocol from being changed (accidentally or intentionally).
Object.freeze(exports);
