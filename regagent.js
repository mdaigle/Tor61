const assert = require('assert');
const dgram = require('dgram');
const dns = require('dns');
const os = require('os');
const protocol = require('./regprotocol');
const readline = require('readline');

// Standard timeout for a response to a request.
const msg_timeout = 1000;

//const args = process.argv.slice(2);
//assert(args.length == 2);

const reg_service_hostname = "cse461.cs.washington.edu";//args[0];
const reg_service_port = 46101; //args[1];

var socket_out = dgram.createSocket('udp4');
// console.log(socket_out);
var socket_in = dgram.createSocket('udp4');
var reg_service_address;
var local_address;


exports.setupRegAgent = function(callback) {
    local_address = getThisHostIP();
    dns.lookup(reg_service_hostname, (err, address, family) => {
        if (err) {
            console.log("error resolving service hostname");
            process.exit(0);
        }

        // console.log("looking up");
        reg_service_address = address;

        //TODO: remove?
        console.log('regServerIP:', address);
        console.log('thisHostIP:', local_address);

        bind_sockets(callback);
    });

}

// Holds mappings from port number to an object holding {service name, service
// data, and a timer id}. The timer id specifies a timer object used for
// reregistering the service.
// var port_map = new Map();
var port_map = {};
var last_register_msg = {};
var last_msg_timeout = null;
var seq_num = 0;
var last_msg_sent = -1;

var shouldPrompt = false;
/*const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});
rl.pause();
*/
messageQueue = [];
function processQueue(messageAction, messageType, responseCallback){
    if (messageType != null && responseCallback != null) {
        MSG_HANDLER[messageType].responseCallback = responseCallback;
    }

    if (messageAction != undefined) {
        messageQueue.push(messageAction);
    }
    if (messageQueue.length > 0) {
        nextAction = messageQueue.shift();
        if (nextAction != undefined) {
            nextAction();
        }
    }
}

function protocolError(location){
    console.log("Protocol Error");
    clearTimeout(last_msg_timeout);
    socket_out.close();
    socket_in.close();
    process.exit(1);
}

function msgTimeout(errMsg, verbose){
    if (last_msg_sent == -1) {
        return;
    }

    if (typeof verbose == "undefined") {verbose = true;}
    if (verbose) {
        console.log(errMsg);
    }

    last_msg_timeout = null;
    if (last_register_msg) {
        port = last_register_msg['service_port'];
        if (port in port_map &&
            'timeout' in port_map[port] &&
            port_map[port].timeout != null){
                clearTimeout(port_map[port].timeout);
        }
        last_register_msg = null;
    }
    last_msg_sent = -1;
    processQueue();
}

// Message Handlers //
function process_registered(msg, rinfo){
    if (last_msg_sent != protocol.REGISTER || !last_register_msg){
        protocolError("process_registered");
    }

    clearTimeout(last_msg_timeout);

    var data = protocol.unpackRegistered(msg);
    if (data == null) { protocolError("null data in process_registered");}

    var port = last_register_msg.service_port;

    if (last_register_msg['explicit_call']) {
        if (MSG_HANDLER[protocol.REGISTERED].responseCallback != null) {
            MSG_HANDLER[protocol.REGISTERED].responseCallback(true);
            MSG_HANDLER[protocol.REGISTERED].responseCallback = null;
        }
    }
    else if ('timeout' in port_map[port] && port_map[port].timeout != null){
        clearTimeout(port_map[port].timeout);
    }

    port_map[port] = last_register_msg;
    var service_data = last_register_msg['service_data'];
    var service_name = last_register_msg['service_name'];

    var reregister_time = (.5) * data.lifetime;
    port_map[port]['timeout'] = setTimeout(function(){
      //called in re-register timeout, on user input and on-message-response
        processQueue(function(){
            send_register(port, service_data, service_name)
        });
    }, reregister_time);
    last_register_msg = {};
    processQueue();
}

function process_fetchresponse(msg, rinfo){
    if (last_msg_sent != protocol.FETCH) {
      protocolError("process_fetchresponse");
    }
    clearTimeout(last_msg_timeout);
    data = protocol.unpackFetchResponse(msg);
    if (data == null) {protocolError("null data in process_fetchresponse");}
    if (MSG_HANDLER[protocol.FETCHRESPONSE].responseCallback != null) {
        MSG_HANDLER[protocol.FETCHRESPONSE].responseCallback(data);
        MSG_HANDLER[protocol.FETCHRESPONSE].responseCallback = null;
    }
    processQueue();
}

function process_probe(msg, rinfo){
    send_ack(socket_in);
}

function process_ack(msg, rinfo){
    if (last_msg_sent == protocol.PROBE){
        clearTimeout(last_msg_timeout);
        last_msg_sent = -1;
        if (MSG_HANDLER[protocol.ACK].responseCallback != null) {
            MSG_HANDLER[protocol.ACK].responseCallback(true);
            MSG_HANDLER[protocol.ACK].responseCallback = null;
        }
    }else if(last_msg_sent == protocol.UNREGISTER){
        clearTimeout(last_msg_timeout);
        last_msg_sent = -1;
        if (MSG_HANDLER[protocol.ACK].responseCallback != null) {
            MSG_HANDLER[protocol.ACK].responseCallback(true);
            MSG_HANDLER[protocol.ACK].responseCallback = null;
        }
    }else{
        protocolError("process_ack");
    }
    processQueue();
}

function send(msg, socket, callback){
    socket.send(msg, 0, msg.length, reg_service_port, reg_service_address, callback);
}

// Command Handlers //
var num_registers_sent = 0;
function send_register(port, service_data, service_name, explicit_call){
    if (typeof explicit_call == "undefined") { explicit_call = false; }

    if (port in port_map) {
        clearTimeout(port_map[port]["timeout"]);
    }

    last_register_msg = {   "service_port": port,
                            "service_name": service_name,
                            "service_data": service_data,
                            "timeout": null,
                            "explicit_call": explicit_call};

    msg = protocol.packRegister(get_sequence_num(), local_address, port, service_data, service_name);
    send(msg, socket_out, function(err){
        last_msg_sent = protocol.REGISTER;
    });

    // We must clear the timeout before we reset it otherwise we will lose the
    // id. Setting the timer again does not overwrite the old timeout.
    clearTimeout(last_msg_timeout);
    errMsg = "Register unsuccessful";
    last_msg_timeout = setTimeout(function(){msgTimeout(errMsg, explicit_call);}, msg_timeout);
}

function send_fetch(service_name){
    msg = protocol.packFetch(get_sequence_num(), service_name);
    send(msg, socket_out, function() {
        last_msg_sent = protocol.FETCH;
    });

    clearTimeout(last_msg_timeout);
    errMsg = "Fetch unsuccessful.";
    last_msg_timeout = setTimeout(function(){msgTimeout(errMsg);}, msg_timeout);
}

function send_unregister(port){
    if (port in port_map) {
        clearTimeout(port_map[port]['timeout']);
    }
    delete port_map[port];

    msg = protocol.packUnregister(get_sequence_num(), local_address, port);
    send(msg, socket_out, function(){
        last_msg_sent = protocol.UNREGISTER;
    });

    clearTimeout(last_msg_timeout);
    errMsg = "Unregister unsuccessful.";
    last_msg_timeout = setTimeout(function(){msgTimeout(errMsg);}, msg_timeout);
}

function send_probe(){
    msg = protocol.packProbe(get_sequence_num());
    send(msg, socket_out, function(){
        last_msg_sent = protocol.PROBE;
    });

    clearTimeout(last_msg_timeout);
    errMsg = "Probe unsuccessful.";
    last_msg_timeout = setTimeout(function(){msgTimeout(errMsg);}, msg_timeout);
}

function send_ack(socket){
    msg = protocol.packAck();
    send(msg, socket, function(){
    });
}

// IO and IO EVENT BINDINGS
// -------------------------------------------------------------------------- //
/*rl.on('line', (line) => {
    shouldPrompt = true;
    rl.pause();
    var arguments = line.split(" ");
    switch (arguments[0]) {
        case "r":
            if (arguments.length != 4 || parseInt(arguments[1]) == NaN) {
                console.log("Register command format is: r port service_data service_name");
                rl.prompt();
                shouldPrompt = false;
                rl.resume();
                break;
            }
            var port = parseInt(arguments[1]);
            var service_data = arguments[2];
            var service_name = arguments[3];
            processQueue(function(){
                send_register(port, service_data, service_name, true);
            });
            break;
        case "u":
            if (arguments.length != 2 || parseInt(arguments[1]) == NaN) {
              console.log("Unregister command format is: u service_port");
              rl.prompt();
              shouldPrompt = false;
              rl.resume();
              break;
            }
            var portnum = parseInt(arguments[1]);
            processQueue(function(){
                send_unregister(portnum);
            });
            break;
        case "f":
            if (arguments.length != 2) {
                console.log("Fetch command format is: f service_name");
                rl.prompt();
                shouldPrompt = false;
                rl.resume();
                break;
            }
            var service_name = arguments[1];
            processQueue(function(){
                send_fetch(service_name);
            });
            break;
        case "p":
            // Note: Not really necessary to wrap this
            processQueue(function(){
                send_probe();
            });
            break;
        case "q":
            rl.close();
            break;
        default:
            console.log("Unrecognized Command");
            rl.prompt();
            shouldPrompt = false;
            rl.resume();
            break;
    }
});

rl.on('close', () => {
    socket_in.close();
    socket_out.close();
    process.exit(1);
});
*/
// function arguments:
//    msg
//    rinfo
MSG_HANDLER =   {
                    "2": {
                        process: process_registered
                    },
                    "4": {
                        process: process_fetchresponse
                    },
                    "6": {
                        process: process_probe
                    },
                    "7": {
                        process: process_ack
                    }
                };

// Only used here so that we know when both sockets are listening.
var num_listening = 0;

socket_out.on('listening', () => {
    num_listening++;
    if (num_listening == 2) {
        //rl.prompt();
        shouldPrompt = false;
        //rl.resume();
    }
});

socket_in.on('listening', () => {
    num_listening++;
    if (num_listening == 2) {
        //rl.prompt();
        shouldPrompt = false;
        //rl.resume();
    }
});

socket_out.on('error', (err) => {
    sock_err(err);
});

socket_in.on('error', (err) => {
    sock_err(err);
});

// Should be called if either socket ever experiences an error. Prints an error
// message, closes the sockets, and exits the program.
function sock_err(err) {
    console.log('Registration socket error');
    socket_out.close();
    socket_in.close();
    process.exit(1);
}

socket_out.on('message', (buf, rinfo) => {
    // Check if this message was solicited
    if (last_msg_sent == -1) {
        return;
    }

    var header = unpackMainFields(buf);
    if (header != null && header.magic == protocol.MAGIC){
    if (command_ok(header.command) && sequence_num_ok(header.seq_num)){
      // valid packet
      MSG_HANDLER[header.command]["process"](buf, rinfo);
      last_msg_sent = -1;
      processQueue();
    }
    }
});

socket_in.on('message', (buf, rinfo) => {
    header = unpackMainFields(buf);
    if (header != null && header.magic == protocol.MAGIC) {
      if (header.command == protocol.PROBE) {
          MSG_HANDLER[header.command](buf, rinfo);
      }
    }
});

// Checks that the given command is one an agent would expect to receive
// (not one a registration service would expect).
function command_ok(command){
    if (command == 2 || command == 4 || command == 6 || command == 7){
        return true;
    }
    return false;
}

// This may need to be changed to match spec behavior for invalid sequence
// Checks that the given sequence number matches the expected sequence number.
function sequence_num_ok(received_seq_num){
    if (received_seq_num == 255 && seq_num == 0) {
        return true;
    }
    return received_seq_num == (seq_num - 1);
}

function get_sequence_num() {
    var result = seq_num;
    seq_num++;
    // Wrap if we exceed 255
    if (seq_num > 255) {
        seq_num = 0;
    }
    return result;
}

// Returns the IPv4 address of this machine.
function getThisHostIP() {
    var interfaces = os.networkInterfaces();
    var addresses = [];
    for (var i in interfaces) {
        for (var j in interfaces[i]) {
            var address = interfaces[i][j];
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push(address.address);
            }
        }
    }
    return addresses[0];
}

// Binds socket_out and socket_in to sequential ports.
function bind_sockets(callback) {
    var rand_port = Math.round((Math.random() * 3000) + 2000);
    socket_out.bind(rand_port, () => {
        socket_in.bind(rand_port + 1, () => {
            callback();
        });
    });
}


//PUBLIC FACING FUNCTIONS
exports.register = function(port, service_data, service_name, callback) {
    processQueue(function(){
        send_register(port, service_data, service_name, true);
    }, protocol.REGISTERED, callback);
}

exports.unregister = function(port, callback) {
    waitForSockets();
    processQueue(function(){
        send_unregister(portnum);
    }, protocol.ACK, callback);
}

exports.fetch = function(service_name, callback) {
    processQueue(function(){
        send_fetch(service_name);
    }, protocol.FETCHRESPONSE, callback);
}

exports.probe = function(callback) {
    waitForSockets();
    processQueue(function(){
        send_probe();
    }, protocol.ACK, callback);
}
