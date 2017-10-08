import _ from 'lodash';
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

const randomChar = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];

const randomStr = (min, max) => {
  let strLength = _.random(min, max);
  let str = '';
  _.times(strLength, () => `${str}${_.sample(randomChar)}`);
  return str;
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export {
  md5,
  logger,
  httpGet,
  httpPost,
  sleep,
  randomStr
};
