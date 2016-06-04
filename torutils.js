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

var oddCircID = 1;
var evenCircID = 2;
function generateCircID(odd) {
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
  newSock = net.createConnection({host: host, port:port});
  socketSetup(newSock, nodeID, true);
  sendWithPromise(protocol.sendOpen, successCallback, failCallback)(newSock, nodeID, receiverID);
}

exports.createTorCircuit = function(nodeID, circID, successCallback, failCallback) {
  sendWithPromise(protocol.sendCreate, successCallback, failCallback)(socket, circID);
}

exports.extendTorConnection = function(host, port, receiverID, circID, successCallback, failCallback) {
  var bodyBuf = packExtendBody(host, port, receiverID);
  var socket = mappings.getNodeToSocketMapping(receiverID);
  sendWithPromise(protocol.sendRelay, successCallback, failCallback)(socket, circID, 0, protocol.RELAY_EXTEND, bodyBuf);
}

exports.createFirstHop = function(host, port, nodeID, receiverID, successCallback, failCallback) {
  openSuccessCallback = function() {
    circID = generateCircID(true);
    createTorCircuit(receiverID, circID, successCallback, failCallback);
  }
  openTorConnection(host, port, nodeID, circID, openSuccessCallback, failCallback);
}

Object.freeze(exports);
