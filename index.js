const http = require('http');
const zlib = require('zlib');

const DEBUG = process.env.LOG_LEVEL === 'verbose';

const initLog = ((init) => (event) => {
  if (!DEBUG) {
    return;
  }
  delete event.options; // eslint-disable-line
  console.log(
    JSON.stringify(
      Object.assign({}, init, { time: Date.now() }, event)
    )
  );
});

const requestWrapper = (options, callback) => {
  const log = initLog({
    url: options.pathname,
  });

  log({ event: 'start', options });

  const request = http.request(options);

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
    if (incomingMessage.statusCode !== 200) {
      callback({ message: 'error', statusCode: incomingMessage.statusCode });
      return;
    }

    const contentType = incomingMessage.headers['content-type'];
    const contentEncoding = incomingMessage.headers['content-encoding'];

    log({ event: 'response', statusCode: incomingMessage.statusCode });

    const send = (completeResponse) => {
      if (contentType && contentType.indexOf('application/json') > -1) {
        try {
          callback(null, incomingMessage, JSON.parse(completeResponse));
        } catch (e) {
          callback(e);
        }
      } else {
        callback(null, incomingMessage, completeResponse);
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
