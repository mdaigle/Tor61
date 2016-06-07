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

exports.generateNodeID = function() {
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
    // console.log("a");
    agent_id = new Buffer(4);
    // console.log("b");
    agent_id.writeUInt32BE(receiverID, 0);
    // console.log("c");
    tempStr = host.toString() + ":" + port.toString() + "\0";
    // console.log("d");
    tempBuf = new Buffer(tempStr);
    // console.log("e");
    return Buffer.concat([tempBuf, agent_id]);
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
  // console.log("created promise");
  return ret;
}

exports.sendWithoutPromise = function(sendFunction) {
  return sendFunction.bind(null, undefined, undefined);
}

exports.openTorConnection = function(host, port, nodeID, receiverID, successCallback, failCallback) {
  // check if already have a socket
  newSock = mappings.getNodeToSocketMapping(receiverID);
  if (newSock == null) {
    newSock = net.createConnection({host: host, port:port}, () => {
     exports.sendWithPromise(protocol.sendOpen, successCallback.bind(null, newSock), failCallback)(newSock, nodeID, receiverID);

      });
  routerloop.socketSetup(newSock, nodeID, true);
  } else {
  exports.sendWithPromise(protocol.sendOpen, successCallback.bind(this, newSock), failCallback)(newSock, nodeID, receiverID);
  }
}

exports.createTorCircuit = function(nodeID, circID, successCallback, failCallback) {
  //console.log("sending create");
  var socket = mappings.getNodeToSocketMapping(nodeID);
  exports.sendWithPromise(protocol.sendCreate, successCallback, failCallback)(socket, circID);
  // console.log("sent create");
  //console.log(socket.UUID);
  //console.log(socket.msgMap);
}

exports.extendTorConnection = function(host, port, receiverID, circID, socket, successCallback, failCallback) {
  // console.log("in extend");
  var bodyBuf = packExtendBody(host, port, receiverID);
  exports.sendWithPromise(protocol.sendRelay, successCallback, failCallback)(socket, circID, 0, protocol.RELAY_EXTEND, bodyBuf);
  // console.log("sent extend with promise");
}

exports.createFirstHop = function(host, port, nodeID, receiverID, circID, successCallback, failCallback) {
  openSuccessCallback = function(newSock) {
    //circID = generateCircID(true);
    mappings.addNodeToSocketMapping(receiverID, newSock);
    // console.log("open success");
    //console.log(newSock.msgMap);
    exports.createTorCircuit(receiverID, circID, successCallback, failCallback);
  }
  exports.openTorConnection(host, port, nodeID, receiverID, openSuccessCallback, failCallback);
}

Object.freeze(exports);
