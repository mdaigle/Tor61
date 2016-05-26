// SETUP
// Setup listening socket, but ignore requests until registered
//  handlers 
// Setup any datastructures
// Build a circuit:
//  Connect to other nodes
// Register with reg service
//  Need way to interface with reg service


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


// Timeout handlers
//  if no response or circuit broken:
//    teardown (as much as possible)
//    Attempt to rebuild circuit using fresh node list


// Need function/mapping to multiplex sockets and circuits
// CircID->node->socket

// Event loop for internal sockets
//  If either-end node:
//   should be using mapping from circID->streamID->socket_out
//   -> in separate asynchronous function
//   -> function/event loop should be mapped on a streamID
//   event loop:
//    .on('data', function(data){
//      buffer.append(data);
//    })
//    setup() {
//      parse buffer etc.
//      once we have host
//      send full buffer and any further data to host
//      change .on('data' function() {
//        forward to server
//      });
//    }
//   Either forward to server with existing connection 
//   or
//   Create new connection to host
//    dns lookup
//    new socket
//    callbacks => multiplex circID/socket etc.
//  Forward all incoming data according to circuit map


// Event loop for client socket
//  similar to proxy event loop
//  once ready, map streamID->socket_out

