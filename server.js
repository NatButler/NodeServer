const http = require('http');
const fs = require('fs');
const url = require('url');
const mime = require('mime');

let methods = {};

const respondErrorOrNothing = respond => {
  return error => {
    if (error) { respond(500, error.toString()); }
    else { respond(204); }
  };
}

const readRangeHeader = (range, totalLength) => {
  if (range == null || range.length == 0) {
    return null;
  }

  let array = range.split(/bytes=([0-9]*)-([0-9]*)/);
  let start = parseInt(array[1]);
  let end = parseInt(array[2]);
  let result = {
    Start: isNaN(start) ? 0 : start,
    End: isNaN(end) ? (totalLength - 1) : end
  };

  if ( !isNaN(start) && isNaN(end) ) {
    result.Start = start;
    result.End = totalLength - 1;
  }

  if ( isNaN(start) && !isNaN(end) ) {
    result.Start = totalLength - end;
    result.End = totalLength - 1;
  }

  return result;
}

methods.GET = (path, respond, request) => {
  fs.stat(path, (error, stats) => {
    if (error && error.code == 'ENOENT') { respond(404, 'File not found'); }
    else if (error) { respond( 500, error.toString() ); }
    else if ( stats.isDirectory() ) {
      fs.readdir(path, (error, files) => {
        if (error) { respond( 500, error.toString() ); }
        else { respond( 200, files.join("\n") ); }
      });
    }
    else {
      let responseHeaders = {};
      let rangeRequest = readRangeHeader(request.headers['range'], stats.size);

      if (rangeRequest == null) {
        responseHeaders['Content-Type'] = mime.lookup(path);
        responseHeaders['Content-Length'] = stats.size;  // File size.
        responseHeaders['Accept-Ranges'] = 'bytes';

        respond(200, fs.createReadStream(path), responseHeaders);
        return null;
      }

      let start = rangeRequest.Start;
      let end = rangeRequest.End;

      // If the range can't be fulfilled. 
      if (start >= stats.size || end >= stats.size) {
        // Indicate the acceptable range.
        responseHeaders['Content-Range'] = 'bytes */' + stats.size; // File size.

        // Return the 416 'Requested range not satisfiable'.
        respond(416, 'Requested range not satisfiable', responseHeaders);
        return null;
      }

      // Indicate the current range.
      responseHeaders['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stats.size;
      responseHeaders['Content-Length'] = start == end ? 0 : (end - start + 1);
      responseHeaders['Content-Type'] = mime.lookup(path);
      responseHeaders['Accept-Ranges'] = 'bytes';
      responseHeaders['Cache-Control'] = 'no-cache';

      // Return the 206 'Partial content'.
      respond(206, fs.createReadStream(path, { start: start, end: end }), responseHeaders);
    }
  });
}

const urlToPath = reqUrl => {
  let path = url.parse(reqUrl).pathname;
  return "." + decodeURIComponent(path);
}

const httpListener = (request, response) => {
  const respond = (responseStatus, body, responseHeaders) => {
    if (!responseHeaders) { 
      let responseHeaders = {};
      responseHeaders['Content-Type'] = 'text/plain'; 
    }

    response.writeHead( responseStatus, responseHeaders );
    console.log(request.method + ' ' + urlToPath(request.url) + ' ' + responseStatus);

    if (body && body.pipe) { body.pipe(response); }
    else { response.end(body); }
  }

  if (request.method in methods) {
    methods[request.method](urlToPath(request.url), respond, request);
  } else { 
    respond(405, 'Method ' + request.method + ' not allowed.');
    console.log('405 Method ' + request.method + ' not allowed.');
  }
}

const server = http.createServer(httpListener).listen(8080, () => {
  console.log('\nServer running at http://localhost:' + server.address().port + '\n');
});