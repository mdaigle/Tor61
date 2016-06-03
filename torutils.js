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

exports.createTorCircuit = function(socket, nodeID, circID, successCallback, failCallback) {
  sendWithPromise(protocol.sendCreate, successCallback, failCallback)(socket, circID);
}
// TODO: pack and unpack fn for body of extend and begin

// TODO:
exports.extendTorConnection = function(socket, host, port, nodeID, receiverID, circID, successCallback, failCallback) {
  var bodyBuf = packExtendBody(host, port, receiverID);
  sendWithPromise(protocol.sendRelay, successCallback, failCallback)(socket, circID, 0, protocol.RELAY_EXTEND, bodyBuf);
}

exports.createFirstHop = function(host, port, nodeID, receiverID, circID, successCallback, failCallback) {
  openSuccessCallback = function() {

    createTorCircuit(, successCallback, failCallback);
  }
  openTorConnection(, openSuccessCallback, failCallback);
}

Object.freeze(exports);
