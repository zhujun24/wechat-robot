import process from 'process';
import {format} from 'util';
import _ from 'lodash';
import generateQRcode from 'qrcode-terminal';
import {httpGet, httpPost, logger, randomStr, sleep} from '../lib/utils';

const URL = {
  QRcode: 'https://login.weixin.qq.com/jslogin?appid=wx782c26e4c19acffb&fun=new&lang=zh_CN&_=%s',
  QRcodeUuid: 'https://login.weixin.qq.com/cgi-bin/mmwebwx-bin/login?uuid=%s&tip=1&_=%s',
  QRcodeImg: 'https://login.weixin.qq.com/l/%s',
  initData: 'https://%s/cgi-bin/mmwebwx-bin/webwxinit?lang=zh_CN&pass_ticket=%s&r=%s',
  contactData: 'https://%s/cgi-bin/mmwebwx-bin/webwxgetcontact?lang=zh_CN&pass_ticket=%s&r=%s&seq=0&skey=%s',
  sendMsgData: 'https://%s/cgi-bin/mmwebwx-bin/webwxsendmsg?lang=zh_CN&pass_ticket=%s',
  webpush: 'https://webpush.%s/cgi-bin/mmwebwx-bin/synccheck?r=%s&skey=%s&sid=%s&uin=%s&deviceid=%s&synckey=%s&_=%s',
};

let wechatData = {
  uuid: '',
  scanedUrl: '',
  domain: '',
  uin: '',
  sid: '',
  pass_ticket: '',
  skey: '',
  FromUserName: '',
  SyncKey: [],
  DeviceID: `e${randomStr(2, 17)}`,
  contactList: []
};

let _checkScan = uuid => new Promise((resolve) => {
  setTimeout(async () => {
    try {
      let scanResult = await httpGet(format(URL.QRcodeUuid, uuid, _.now()));
      scanResult = scanResult.body.replace(/\n/, '');
      if (/window\.code=200/.test(scanResult)) {
        scanResult = scanResult.match(/"(.+)"/)[1];
        resolve(scanResult);
      } else {
        resolve(false);
      }
    } catch (e) {
      resolve(false);
    }
  }, 1000);
});

let checkScan = async (uuid) => {
  let scanResult = await _checkScan(uuid);
  if (!scanResult) {
    logger.debug('等待扫码确认中...');
    return await checkScan(uuid);
  }
  logger.info('扫码确认成功!');
  return scanResult;
};

let scaned = false;
let scanPromise;

let showQRcode = () => {
  if (scaned) {
    return scanPromise;
  } else {
    scanPromise = (async () => {
      let uuidHttpResponse = await httpGet(format(URL.QRcode, _.now()));
      wechatData.uuid = uuidHttpResponse.body.match(/"(.+)"/)[1];
      await sleep(1000);
      generateQRcode.generate(format(URL.QRcodeImg, wechatData.uuid));
      wechatData.scanedUrl = await checkScan(wechatData.uuid);
      wechatData.domain = wechatData.scanedUrl.match(/https:\/\/(wx2?\.qq\.com)/)[1];
      let scanedData = await httpGet({
        url: wechatData.scanedUrl,
        followRedirect: false
      });
      wechatData.cookie = _.chain(scanedData)
        .get('headers.set-cookie')
        .map(item => _.get(item.split(';'), '[0]'))
        .join('; ')
        .value();
      scanedData = scanedData.body;
      wechatData.uin = wechatData.cookie.match(/wxuin=(.+?);/)[1];
      wechatData.sid = wechatData.cookie.match(/wxsid=(.+?);/)[1];
      wechatData.pass_ticket = scanedData.match(/pass_ticket>(.+?)<\/pass_ticket/)[1];
      wechatData.skey = scanedData.match(/skey>(.+?)<\/skey/)[1];

      let initDataHttpResponse = await httpPost({
        url: format(URL.initData, wechatData.domain, wechatData.pass_ticket, _.now),
        body: JSON.stringify({
          BaseRequest: {
            Uin: wechatData.uin,
            Sid: wechatData.sid,
            Skey: wechatData.skey,
            DeviceID: wechatData.DeviceID
          }
        })
      });
      let initData;
      try {
        initData = JSON.parse(initDataHttpResponse.body);
      } catch (e) {
        logger.error(JSON.stringify(initDataHttpResponse, null, 2));
        logger.error(JSON.stringify(e));
        process.exit(1);
      }
      wechatData.FromUserName = initData.User.UserName;
      wechatData.SyncKey = initData.SyncKey.List;

      let contactDataHttpResponse = await httpPost({
        url: format(URL.contactData, wechatData.domain, wechatData.pass_ticket, _.now(), wechatData.skey),
        headers: {
          Cookie: wechatData.cookie
        }
      });
      let contactData = JSON.parse(contactDataHttpResponse.body);
      wechatData.contactList = contactData.MemberList;
    })();
    scaned = true;
    return scanPromise;
  }
};

const sendMsg = async (nickname, msg) => {
  logger.info(`sendMsg with nickname ${nickname} and msg ${msg}.`);
  nickname = nickname || '微信团队';
  nickname = decodeURIComponent(nickname);
  msg = msg || 'Hello World!';
  msg = decodeURIComponent(msg);
  let ToUserName = _.filter(wechatData.contactList, u => u.NickName === nickname);
  if (!ToUserName || !ToUserName.length) {
    return 'user not found';
  }
  ToUserName = ToUserName[0].UserName;
  let ClientMsgId = `${_.now()}1234`;
  let sendMsgHttpResponse = await httpPost({
    url: format(URL.sendMsgData, wechatData.domain, wechatData.pass_ticket),
    body: JSON.stringify({
      BaseRequest: {
        Uin: wechatData.uin,
        Sid: wechatData.sid,
        Skey: wechatData.skey,
        DeviceID: wechatData.DeviceID
      },
      Msg: {
        Type: 1,
        Content: msg,
        FromUserName: wechatData.FromUserName,
        ToUserName,
        LocalID: ClientMsgId,
        ClientMsgId
      },
      Scene: 0
    })
  });
  sendMsgHttpResponse = JSON.parse(sendMsgHttpResponse.body);
  return sendMsgHttpResponse;
};

const heartBeatDetect = async () => {
  let synckey = [];
  _.map(wechatData.SyncKey, (sk) => {
    let k = `${sk.Key}_${sk.Val}`;
    synckey.push(k);
  });
  synckey = synckey.join('|');
  let webpushData = await httpGet({
    url: format(URL.webpush, wechatData.domain, _.now(), wechatData.skey, wechatData.sid, wechatData.uin, wechatData.DeviceID, synckey, _.now()),
    headers: {
      Cookie: wechatData.cookie
    }
  });
  logger.info(webpushData.body);
  return /retcode:"0"/.test(webpushData.body);
};

const getContactList = () => {
  return wechatData.contactList;
};

export {
  showQRcode,
  sendMsg,
  heartBeatDetect,
  getContactList
};
