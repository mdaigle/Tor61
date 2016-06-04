/* Notes:
 * All send callbacks and timeouts need to clear socket msgMap entries
 * TODO: we need to use rl so we can quit and unregister
 * TODO: need to change service_name to be correct
 */


var net = require('net');
var dns = require('dns');
var mappings = require('./mappings');
var protocol = require('./protocol');
// var clientloop = require('./clientloop'); ??????????????
var serverloop = require('./serverloop');
var routerloop = require('./routerloop');
var torutils = require('./torutils');
var regagent = require('./regagent');

// SETUP
// Setup listening socket, but ignore requests until registered
//  handlers
// Setup any datastructures
// Build a circuit:
//  Connect to other nodes
// Register with reg service
//  Need way to interface with reg service
var nodeID = torutils.generateNodeID();
console.log("nodeID:" + nodeID);
var args = process.argv.slice(2);
var torNodePort =  1461;//args[0]; // CHANGE


// need mapping from nodes -> sockets
var torNode = net.createServer((socket) => {
  routerloop.socketSetup(socket, nodeID, false);
});

torNode.on('error', (err) => {

});


torNode.listen(torNodePort); // can add callback

/* Notes:
 * Maybe we should connect to all routers so that the relay-extend
 * time is shorter (and so we don't hit timeouts)
 *
 * The only times we have sequential control sequences is when opening
 * a connection or a stream and then sending a create or data.
 * We can use the map mentioned above and should be on a per-socket basis
 *
 *
 *
 * We need a pending message response map which use the request/key
 * components as a key and a callback function as the mapped value
 * and then when we receive a response we can cancel the timeout
 * and execute the callback
 */

// THIS IS PSEUDOCODE
// function connectToRouter(rip, rport, rID) {
//   try {
//     currSocket = net.createConnection({host: rip, port: rport});
//     routerLoop.socketSetup(currSocket, nodeID, true);
//     currSocket.msgMap[protocol.OPEN] = function(response) {
//       if (response == protocol.OPENED) {
//         // finish building the circuit
//         // function that sends relay extends
//       } else {
//         // destroy what we have and rebuild
//         //
//         buildCircuit()
//       }
//     };
//
//     protocol.sendOpen(currSocket, nodeID, rID,function() {
//         // destroy what we have and rebuild
//         //
//         buildCircuit()
//       }
//     );
//     return currSocket
//     // we should block until we get an Opened or hit a timeout?
//   } catch(err) {
//     return null;
//   }
// }
//
// // fetch list of all nodes
// var routerList = [];
// // determine circuit
// // choose first node and send Open/Create
// function buildCircuit() {
//   do{
//     currRouter = routerList[random(0, routerList.length)];
//     currSock = connectToRouter(currRouter.ip, currRouter.port, currRouter.id);
//     //
//     protocol.sendCreate(socket, currCircID);
//   }while(currSock == null);
// }
// for (int i = 1; i < circLength; i ++) {
//   // same thing but pick a node and send relay extend
//
// }

// TODO: fix parsing of host port
function buildCircuit(onCircuitCompletion) {
  regagent.fetch("daigle-tsen", function(response) {
    if (!("entries" in response)) {
      console.log("reg fail");
      return;
    }
    tempList = response["entries"];
    var resultList = [];
    console.log(tempList);
    function testNode(i, finalCallback) {
      console.log(i);
      if (i == tempList.length) {finalCallback(); return;}
      node = tempList[i];
      node["host"] = torutils.parseIP(node.service_addr.address);
      node["port"] = node.service_addr.port;
      var tempSock = net.createConnection({host: node.host, port:node.port});
      tempSock.on('error', (err) => {console.log("err");tempSock.end(); testNode(i+1, finalCallback);});
      tempSock.on('connect', () => {resultList.push(node);testNode(i+1, finalCallback); tempSock.end();});
    }
    testNode(0, function(){

    console.log(resultList);
    // TODO: add ourselves to the list
    // console.log(resultList);

    if (resultList.length <= 0) {
      mappings.BASE_CIRC_ID = 0;
      onCircuitCompletion();
    } else {
      // randomly pick first hop
      var numLayers = 5; // actually numLayers + 1
      do{
        numLayers -= 1;
        firstNode = resultList[Math.floor(Math.random()*resultList.length)];
        firstNode["host"] = torutils.parseIP(firstNode.service_addr.address);
        firstNode["port"] = firstNode.service_addr.port;
      }while(firstNode.service_data == nodeID && numLayers >= 0);
      function failCallback() {
        console.log("Failed");
        buildCircuit(onCircuitCompletion);
      }
      firstCircID = torutils.generateCircID((mappings.getNodeToSocketMapping(firstNode.service_data) == null));
      if (numLayers > 0) {
      torutils.createFirstHop(firstNode.host, firstNode.port, nodeID, firstNode.service_data, firstCircID, function() {
        console.log("first node success");
        mappings.BASE_CIRC_ID = firstCircID;
        do {
        console.log("in loop");
        secondNode = resultList[Math.floor(Math.random()*resultList.length)];
        secondNode["host"] = torutils.parseIP(firstNode.service_addr.address);
        secondNode["port"] = firstNode.service_addr.port;
        numLayers -= 1;
        console.log("end of loop");
        } while (secondNode.service_data == nodeID && numLayers >= 0);
        console.log("second");
        // TODO: double check function portrait
        if (numLayers > 0) {
          console.log("extending");
        torutils.extendTorConnection(secondNode.host, secondNode.port, secondNode.service_data, torutils.generateCircID(true), function() {
          do {
          thirdNode = resultList[Math.floor(Math.random()*resultList.length)];
          thirdNode["host"] = torutils.parseIP(firstNode.service_addr.address);
          thirdNode["port"] = firstNode.service_addr.port;
          numLayers -= 1;
          } while(thirdNode.service_data == nodeID && numLayers >= 0);
          console.log("third");
          if (numLayers > 0) {
          torutils.extendTorConnection(thirdNode.host, thirdNode.port, thirdNode.service_data, generateCircID(true), function() {
            do {
            endNode = resultList[Math.floor(Math.random() *resultList.length)];
            endNode["host"] = torutils.parseIP(firstNode.service_addr.address);
            endNode["port"] = firstNode.service_addr.port;
            numLayers -= 1;
            } while(endNode.service_data == nodeID && numLayers >= 0);
            console.log("end");
            if (numLayers > 0) {
            torutils.extendTorConnection(endNode.host, endNode.port, endNode.service_data, generateCircID(true), onCircuitCompletion, failCallback);
            } else {
              onCircuitCompletion();
            }
          }, failCallback);
          } else {
            onCircuitCompletion();
          }
        }, failCallback);
        } else {
        onCircuitCompletion();
      }
      }, failCallback);
      } else {
        onCircuitCompletion();
      }
    }
  });});
}

var readline = require('readline');
var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.pause();
rl.on('line', (line) => {
  if (line == "q") {
    regagent.unregister(torNodePort, function() {
      process.exit(0);
    });
  }
});

rl.on('close', () => {
  // teardown fn
});

regagent.setupRegAgent(function(){
    buildCircuit(function(){regagent.register(torNodePort, nodeID, "daigle-tsen", function(){console.log("registered");
rl.resume();
})});
});

/*
 * If routerList is empty and no other nodes exist,
 * leave global circID null or some known self-constant
 * When we call getCircuitMapping we should check
 *
 * Add base circuit mapping that is
 * {srcID: ourNodeID, srcCircID: selfCircConst, dstID: null, dstCircID: null}
 *
 * ClientLoop should know when looping through self based upon BASE_CIRC_ID
 *
 * When looping through self serverloop and clientloop should access streamID to
 * socket and forward data, ignoring routerLoop.*/

// TEARDOWN
//  Teardown circuit (send Destroy)
//    Forward Destroy (and hope it propagates)
//    (?) Send Destroy backwards & forwards for any circuits passing through us
//  Closing as many sockets as possible
//    Need a way to interrupt either event loop


// Global Event Emitter
//  each client connection should register their own listener for custom
//  shutdown event
//    close relevant in-scope sockets
//  Relay_Connected & Relay_BeginFailed see comments in clientloop.js


// Timeout handlers
//  if no response or circuit broken:
//    teardown (as much as possible)
//    Attempt to rebuild circuit using fresh node list

// register with service
//
