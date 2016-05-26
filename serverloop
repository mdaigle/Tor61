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
