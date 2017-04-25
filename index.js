const http = require('http');
const url = require('url');
const zlib = require('zlib');

const initLog = ((init) => (event) => {
  console.log(
    JSON.stringify(
      Object.assign({}, init, { time: Date.now() }, event)
    )
  );
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

  const log = initLog({
    url: url.parse(options).format(),
  });

  log({ event: 'start', options });

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

  ['abort', 'aborted', 'continue', 'socket', 'upgrade'].forEach((eventName) => {
    request.on(eventName, () => {
      log({ event: eventName });
    });
  });

  request.on('connect', (res, socket, head) => {
    log({ event: 'connect', head });
  });

  request.on('error', (e) => {
    log({ event: 'error', error: e });
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

    const contentType = incomingMessage.headers['content-type'];
    const contentEncoding = incomingMessage.headers['content-encoding'];

    log({ event: 'response', statusCode: incomingMessage.statusCode });

    const send = (completeResponse) => {
      if (contentType && contentType.indexOf('application/json') > -1) {
        try {
          callback(null, JSON.parse(completeResponse));
        } catch (e) {
          callback(e);
        }
      } else {
        callback(null, completeResponse);
      }
    };

    const getIncomingMessageHandler = () => {
      const buffer = [];

      if (contentEncoding && contentEncoding.indexOf('gzip') > -1) {
        return function decompressResponse(stream) {
          const gunzip = zlib.createGunzip();

          gunzip.on('data', (chunk) => {
            log({ message: 'http reqeust', event: 'data(gzip)', chunkLength: chunk.length });
            buffer.push(chunk.toString());
          });

          gunzip.on('end', () => {
            send(buffer.join());
          });

          stream.pipe(gunzip);
        };
      }
      return function readResponse(stream) {
        stream.setEncoding('utf8');

        stream.on('data', (chunk) => {
          log({ event: 'data', chunkLength: chunk.length });
          buffer.push(chunk);
        });

        stream.on('end', () => {
          log({ event: 'end', responseLength: buffer.length });
          send(buffer.join());
        });
      };
    };

    const handleResponseStream = getIncomingMessageHandler();

    handleResponseStream(incomingMessage);
  });

  request.end();
};

module.exports = requestWrapper;
