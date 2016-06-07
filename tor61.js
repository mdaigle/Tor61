/* Notes:
 * All send callbacks and timeouts need to clear socket msgMap entries
 * TODO: we need to use rl so we can quit and unregister
 * TODO: need to change service_name to be correct
 */


var net = require('net');
var dns = require('dns');
var mappings = require('./mappings');
var protocol = require('./protocol');
var clientloop = require('./clientloop');
var serverloop = require('./serverloop');
var routerloop = require('./routerloop');
var torutils = require('./torutils');
var regagent = require('./regagent');

var args = process.argv.slice(2);
var torNodePort =  1461;
var group_num = args[0];
var instance_num = args[1];
var proxyPort = args[2];

var nodeID = torutils.generateNodeID();
console.log("nodeID:" + nodeID);

var service_name = "Tor61Router-" + group_num + "-" + instance_num;

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
var maxBuildTries = 4;
// TODO: fix parsing of host port
function buildCircuit(onCircuitCompletion) {
  if (maxBuildTries < 0) {
    console.log("Failed to build a circuit. Shutting down.");
    // TODO: shutdown cleanly
    process.exit(0);
  }
  maxBuildTries -= 1;
  regagent.fetch("Tor61Router-0666", function(response) {
    //   console.log("Got a fetch response");
    if (!("entries" in response)) {
      console.log("reg fail");
      return;
    }
    tempList = response["entries"];
    var resultList = [];
    function testNode(i, finalCallback) {
        if (i == tempList.length) {
            finalCallback(); return;
        }
        node = tempList[i];
        node["host"] = torutils.parseIP(node.service_addr.address);
        node["port"] = node.service_addr.port;

        var tempSock = net.createConnection({host: node.host, port:node.port});

        timer = setTimeout(function(){
            tempSock.end();
            testNode(i+1, finalCallback);
        }, 4000);

        tempSock.on('error', (err) => {
            clearTimeout(timer);
            console.log("err");
            tempSock.end();
            testNode(i+1, finalCallback);
        });
        tempSock.on('connect', () => {
            clearTimeout(timer);
            resultList.push(node);
            testNode(i+1, finalCallback);
            tempSock.end();
        });
    }
    testNode(0, function(){
    resultList.push({service_data: nodeID, service_addr: {address: regagent.local_address, port: torNodePort}});
    console.log("\nAvailable nodes are:");
    for (i = 0; i < resultList.length; i++) {
        console.log("ID:" + resultList[i].service_data);
    }
    console.log();

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
        console.log("========> First hop in circuit created to: " + firstNode.service_data);
        mappings.BASE_CIRC_ID = firstCircID;
        var first_hop_socket = mappings.getNodeToSocketMapping(firstNode.service_data);

        mappings.addCircuitMapping(nodeID, firstCircID, firstNode.service_data, firstCircID);
        mappings.addCircuitMapping(firstNode.service_data, firstCircID, null, null);

        do {
        secondNode = resultList[Math.floor(Math.random()*resultList.length)];
        secondNode["host"] = torutils.parseIP(secondNode.service_addr.address);
        secondNode["port"] = secondNode.service_addr.port;
        numLayers -= 1;
        console.log("Attempting to extend to " + secondNode.service_data);
        } while (secondNode.service_data == nodeID && numLayers >= 0);
        // TODO: double check function portrait
        if (numLayers > 0) {
        //   console.log("extending");
        torutils.extendTorConnection(secondNode.host, secondNode.port, secondNode.service_data, firstCircID, first_hop_socket, function() {
            console.log("========> Second hop in circuit created to: " + secondNode.service_data);
            do {
                thirdNode = resultList[Math.floor(Math.random()*resultList.length)];
                thirdNode["host"] = torutils.parseIP(thirdNode.service_addr.address);
                thirdNode["port"] = thirdNode.service_addr.port;
                numLayers -= 1;
                console.log("Attempting to extend to " + thirdNode.service_data);
            } while(thirdNode.service_data == nodeID && numLayers >= 0);
            // console.log("third");
            if (numLayers > 0) {
                // console.log("extending");
                torutils.extendTorConnection(thirdNode.host, thirdNode.port, thirdNode.service_data, firstCircID, first_hop_socket, function() {
                    console.log("========> Third hop in circuit created to: " + thirdNode.service_data);
                    do {
                        endNode = resultList[Math.floor(Math.random() *resultList.length)];
                        endNode["host"] = torutils.parseIP(endNode.service_addr.address);
                        endNode["port"] = endNode.service_addr.port;
                        numLayers -= 1;
                        console.log("Attempting to extend to " + endNode.service_data);
                    } while(endNode.service_data == nodeID && numLayers >= 0);
                    // console.log("end");
                    if (numLayers > 0) {
                        // console.log("extending");
                        torutils.extendTorConnection(endNode.host, endNode.port, endNode.service_data, firstCircID, first_hop_socket, onCircuitCompletion, failCallback);
                    } else {
                        onCircuitCompletion();
                    }
                }.bind(this), failCallback);
          } else {
              console.log("no fourth");
              onCircuitCompletion();
          }
        }.bind(this), failCallback);
        } else {
        onCircuitCompletion();
      }
      }.bind(this), failCallback);
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
    regagent.unregister(torNodePort, function() {
    buildCircuit(function(){
        regagent.register(torNodePort, nodeID, service_name, function(){
            console.log("registered");
            clientloop.startClientLoop(nodeID, proxyPort);
            rl.resume();
        })
    }.bind(this));
});});
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
