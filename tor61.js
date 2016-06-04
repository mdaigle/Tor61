/* Notes:
 * All send callbacks and timeouts need to clear socket msgMap entries
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
    resultList = response["entries"];
    console.log(resultList);

    if (resultList.length <= 0) {
      mappings.BASE_CIRC_ID = 0;
      onCircuitCompletion();
    } else {
      // randomly pick first hop
      firstNode = resultList[Math.floor(Math.random()*resultList.length)];
      firstNode["host"] = torutils.parseIP(firstNode.service_addr.address);
      firstNode["port"] = firstNode.service_addr.port;
      function failCallback() {
        console.log("Failed");
        buildCircuit(onCircuitCompletion);
      }
      torutils.createFirstHop(firstNode.host, firstNode.port, nodeID, firstNode.service_data, function() {
        secondNode = resultList[Math.random(0, resultList.length)];
        secondNode["host"] = torutils.parseIP(firstNode.service_addr.address);
        secondNode["port"] = firstNode.service_addr.port;

        // TODO: double check function portrait
        torutils.extendTorConnection(secondNode.host, secondNode.port, secondNode.service_data, generateCircID(true), function() {
          thirdNode = resultList[Math.random(0, resultList.length)];
          thirdNode["host"] = torutils.parseIP(firstNode.service_addr.address);
          thirdNode["port"] = firstNode.service_addr.port;
          torutils.extendTorConnection(thirdNode.host, thirdNode.port, thirdNode.service_data, generateCircID(true), function() {
            endNode = resultList[Math.random(0, resultList.length)];
            endNode["host"] = torutils.parseIP(firstNode.service_addr.address);
            endNode["port"] = firstNode.service_addr.port;
            torutils.extendTorConnection(endNode.host, endNode.port, endNode.service_data, generateCircID(true), onCircuitCompletion, failCallback);
          }, failCallback);
        }, failCallback);
      }, failCallback);
    }
  });
}
regagent.setupRegAgent(function(){
    buildCircuit(function(){regagent.register(torNodePort, nodeID, "daigle-tsen", function(){console.log("registered");})});
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
