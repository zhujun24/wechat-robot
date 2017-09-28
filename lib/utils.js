import crypto from 'crypto';
import request from 'request';
import log4js from 'log4js';

log4js.configure({
  appenders: [{
    type: 'console',
    layout: {
      type: 'pattern',
      pattern: '%[[%d{ISO8601}]%] %m%n'
    }
  }]
});

let _logger = log4js.getLogger();

let logger = {
  configure: (level) => {
    _logger.setLevel(level || 'info');
  },
  prefix: pre => `[${pre || 'default'}] `
};

for (let method of ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'mark', 'log']) {
  logger[method] = (msg) => {
    if (msg instanceof Error) {
      msg = `${msg.stack}`;
    }
    _logger[method](`${logger.prefix()}${msg}`);
  };
}

const md5 = (str) => {
  let hash = crypto.createHash('md5');
  hash.update(str);
  return hash.digest('hex');
};

const httpGet = async(options) => {
  return new Promise((resolve, reject) => {
    request.get(options, (err, res) => {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    });
  });
};

const httpPost = async(options) => {
  return new Promise((resolve, reject) => {
    request.post(options, (err, res) => {
      if (err) {
        reject(err);
      } else {
        resolve(res);
      }
    });
  });
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export {
  md5,
  logger,
  httpGet,
  httpPost,
  sleep
};
