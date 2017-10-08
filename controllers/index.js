import {format} from 'util';
import _ from 'lodash';
import generateQRcode from 'qrcode-terminal';
import {httpGet, httpPost, logger, randomStr, sleep} from '../lib/utils';

const URL = {
  QRcode: 'https://login.weixin.qq.com/jslogin?appid=wx782c26e4c19acffb&fun=new&lang=zh_CN&_=%s',
  QRcodeUuid: 'https://login.weixin.qq.com/cgi-bin/mmwebwx-bin/login?uuid=%s&tip=1&_=%s',
  QRcodeImg: 'https://login.weixin.qq.com/l/%s',
  initData: 'https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxinit?lang=zh_CN&pass_ticket=%s&r=%s',
  initData2: 'https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxinit?r=%s',
  contactData: 'https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxgetcontact?r==%s',
  contactData2: 'https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxgetcontact?lang=zh_CN&pass_ticket=%s&r=%s&seq=0&skey=%s',
  sendMsgData: 'https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxsendmsg?pass_ticket=%s',
  sendMsgData2: 'https://wx2.qq.com/cgi-bin/mmwebwx-bin/webwxsendmsg?lang=zh_CN&pass_ticket=%s'
};

let wechatData = {
  uuid: '',
  scanedUrl: '',
  uin: '',
  sid: '',
  pass_ticket: '',
  skey: '',
  FromUserName: '',
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
      await sleep(2000);
      generateQRcode.generate(format(URL.QRcodeImg, wechatData.uuid));
      wechatData.scanedUrl = await checkScan(wechatData.uuid);
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
        url: format(URL.initData, wechatData.pass_ticket, _.now),
        body: JSON.stringify({
          BaseRequest: {
            Uin: wechatData.uin,
            Sid: wechatData.sid,
            Skey: wechatData.skey,
            DeviceID: wechatData.DeviceID
          }
        })
      });
      let initData = JSON.parse(initDataHttpResponse.body);
      if (initData.BaseResponse.Ret !== 0) {
        initDataHttpResponse = await httpPost({
          url: format(URL.initData2, _.now),
          headers: {
            Cookie: wechatData.cookie
          },
          body: JSON.stringify({
            BaseRequest: {
              Uin: wechatData.uin,
              Sid: wechatData.sid,
              Skey: wechatData.skey,
              DeviceID: wechatData.DeviceID
            }
          })
        });
        initData = JSON.parse(initDataHttpResponse.body);
      }
      wechatData.FromUserName = initData.User.UserName;

      let contactDataHttpResponse = await httpPost({
        url: format(URL.contactData, _.now()),
        headers: {
          Cookie: wechatData.cookie
        }
      });
      let contactData = JSON.parse(contactDataHttpResponse.body);
      if (!contactData.MemberList || !contactData.MemberList.length) {
        contactDataHttpResponse = await httpPost({
          url: format(URL.contactData2, wechatData.pass_ticket, _.now(), wechatData.skey),
          headers: {
            Cookie: wechatData.cookie
          }
        });
        contactData = JSON.parse(contactDataHttpResponse.body);
      }
      wechatData.contactList = contactData.MemberList;
    })();
    scaned = true;
    return scanPromise;
  }
};

const sendMsg = async (nickname, msg) => {
  logger.info(`sendMsg with nickname ${nickname} and msg ${msg}.`);
  nickname = nickname || '低位';
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
    url: format(URL.sendMsgData, wechatData.pass_ticket),
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
  if (sendMsgHttpResponse.BaseResponse.Ret !== 0) {
    sendMsgHttpResponse = await httpPost({
      url: format(URL.sendMsgData2, wechatData.pass_ticket),
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
  }
  // logger.info(JSON.stringify(sendMsgHttpResponse, null, 2));
  return sendMsgHttpResponse;
};

const getContactList = () => {
  return wechatData.contactList;
};

export {
  showQRcode,
  sendMsg,
  getContactList
};
