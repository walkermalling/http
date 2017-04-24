const http = require('http');
const zlib = require('zlib');

const log = ((obj) => {
  console.log(JSON.stringify(obj));
});

const requestWrapper = (options, callback) => {
  /* options:
       protocol,
       host,
       hostname,
       family,
       port,
       localAddress,
       socketPath,
       method,
       path,
       headers,
       auth,
       agent,
       createConnection,
       timeout
  */
  
  log({ message: 'http request', event: 'start', time: Date.now(), options });
  
  const request = http.request(options);
  /*
    'request' is an instance of http.ClientRequest
    https://nodejs.org/api/http.html#http_class_http_clientrequest
    events: 
      abort,
      aborted,
      connect,
      contniue,
      response,
      socket,
      upgrade,
  */
  
  ['abort', 'aborted', 'continue', 'upgrade'].forEach((eventName) => {
    request.on(eventName, () => {
      log({ message: 'http request', event: eventName, time: Date.now(), url: options.url });
    });
  });

  request.on('connect', (res, socket, head) => {
    log({ message: 'http request', event: 'connect', time: Date.now(), url: options.url, head });
  });

  request.on('socket', (socket) => {
    log({ message: 'http request', event: 'socket', time: Date.now(), url: options.url });
  });

  request.on('error', (e) => {
    log({ message: 'http request', event: 'error', time: Date.now(), url: options.url, error: e });
    callback(e);
  });

  request.on('response', (incomingMessage) => {
    /*
      incomingMessage is an instance of http.IncomingMessage
      response is emitted only once
      events: 
      aborted, 
      close
      methods:
      destroy,
      header,
      httpVersion,
      method,
      rawHeaders,
      rawTrailers,
      setTimeout,
      socket,
      statusCode,
      statusMessage,
      trailers,
      url
    */
    
    log({
      message: 'http request',
      event: 'response',
      time: Date.now(),
      url: options.url,
      statusCode: incomingMessage.statusCode,
    });

    const send = (completeResponse) => {
      if (incomingMessage.headers['content-type'] && incomingMessage.headers['content-type'].indexOf('application/json') > -1) {
        try {
          callback(null, JSON.parse(completeResponse));
        } catch (e) {
          callback(e);
        }
      } else {
        callback(null, completeResponse);
      }
    };

    const getIncomingMessageHandler = (headers) => {
      const buffer = [];
      
      if (headers['content-encoding'] && headers['content-encoding'].indexOf('gzip') > -1) {

        return function decompressResponse (stream) {
          
          const gunzip = zlib.createGunzip();
          
          gunzip.on('data', (chunk) => {
            log({ message: 'http reqeust', event: 'data(gzip)', time: Date.now(), url: options.url, chunkLength: chunk.length });
            buffer.push(chunk.toString());
          });

          gunzip.on('end', () => {
            send(buffer.join());
          });

          stream.pipe(gunzip);
        };
        
      } else {

        return function readResponse (stream) {
          
          stream.setEncoding('utf8');

          stream.on('data', (chunk) => {
            log({ message: 'http reqeust', event: 'data', time: Date.now(), url: options.url, chunkLength: chunk.length });
            buffer.push(chunk);
          });

          stream.on('end', () => {
            log({ message: 'http request', event: 'end', time: Date.now(), url: options.url, responseLength: buffer.length });
            send(buffer.join());
          });
          
        };
      }
    };

    const handleResponseStream = getIncomingMessageHandler(incomingMessage.headers);

    handleResponseStream(incomingMessage);

  });
  
  request.end();
};

module.exports = requestWrapper;
