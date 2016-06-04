const crypto = require('crypto');
var routerloop = require('./routerloop');
var net = require('net');
var protocol = require('./protocol');
var mappings = require('./mappings');

exports.parseIP = function(ip_as_int) {
    buf = new Buffer(4);
    buf.writeUInt32BE(ip_as_int);
    ip = buf.readUInt8(0).toString() + "." +
        buf.readUInt8(1).toString() + "." +
        buf.readUInt8(2).toString() + "." +
        buf.readUInt8(3).toString();
    return ip;
}

exports.generateNodeID = function(ip, port) {
    //TODO: legit hash at some point?
    /*var components = ip.split('.');
    for (var i = 0; i < components.length; i++) {
        message_buffer.writeUInt8(parseInt(components[i]), 4 + i);
    }*/
    bytes = crypto.randomBytes(4);
    return bytes.readUInt32BE(0);
}

var oddCircID = 1;
var evenCircID = 2;
exports.generateCircID = function(odd) {
    if (odd) {
        id = oddCircID;
        oddCircID += 2;
        return id;
    }
    id = evenCircID;
    evenCircID += 2;
    return id;
}

function packExtendBody(host, port, receiverID) {
    return host.toString() + ":" + port.toString() + "\0" + receiverID.toString();
}

// Note: send functions that should use this include:
//  sendCreate
//  sendOpen
//  sendRelay
//
// Timeout callback should be function(){rej();}
exports.sendWithPromise = function(sendFunction, successCallback, failCallback) {
  var ret = null;
  var p = new Promise(function(resolve, reject) {
    ret = sendFunction.bind(null, resolve, reject);
  });
  p.then(function(){
    successCallback();
  });
  p.catch(function() {
    failCallback();
  });
  return ret;
}

exports.sendWithoutPromise = function(sendFunction) {
  return sendFunction.bind(null, undefined, undefined);
}

exports.openTorConnection = function(host, port, nodeID, receiverID, successCallback, failCallback) {
  // check if already have a socket
  newSock = mappings.getNodeToSocketMapping(receiverID);
  if (newSock == null) {
    newSock = net.createConnection({host: host, port:port});
  }
  routerloop.socketSetup(newSock, nodeID, true);
  exports.sendWithPromise(protocol.sendOpen, successCallback, failCallback)(newSock, nodeID, receiverID);
}

exports.createTorCircuit = function(nodeID, circID, successCallback, failCallback) {
  exports.sendWithPromise(protocol.sendCreate, successCallback, failCallback)(socket, circID);
}

exports.extendTorConnection = function(host, port, receiverID, circID, successCallback, failCallback) {
  var bodyBuf = packExtendBody(host, port, receiverID);
  var socket = mappings.getNodeToSocketMapping(receiverID);
  exports.sendWithPromise(protocol.sendRelay, successCallback, failCallback)(socket, circID, 0, protocol.RELAY_EXTEND, bodyBuf);
}

exports.createFirstHop = function(host, port, nodeID, receiverID, circID, successCallback, failCallback) {
  openSuccessCallback = function() {
    //circID = generateCircID(true);
    exports.createTorCircuit(receiverID, circID, successCallback, failCallback);
  }
  exports.openTorConnection(host, port, nodeID, receiverID, openSuccessCallback, failCallback);
}

Object.freeze(exports);
