// import _ from 'lodash';
import Koa from 'koa';
import Router from 'koa-router';
import koaStatic from 'koa-static';
import bodyparser from 'koa-bodyparser';
import Pug from 'koa-pug';
import {CronJob} from 'cron';
import config from './config';
import {logger} from './lib/utils';
import {showQRcode, sendMsg, heartBeatDetect, getContactList} from './controllers/index';

const TZ = 'Asia/Shanghai';

const app = new Koa();
const router = new Router();

new Pug({
  viewPath: `${__dirname}/views`,
  helperPath: [
    { _: require('lodash') },
    { moment: require('moment') }
  ],
  noCache: true,
  app
});

router.get('/', async (ctx) => {
  ctx.body = 'Welcome to Wechat-Robot!';
  ctx.render('index', {}, true);
});

router.get('/health', async (ctx) => {
  ctx.body = 'OK';
});

router.get('/sendMsg', async (ctx) => {
  let query = ctx.query;
  let {nickname, msg} = query;
  let result = await sendMsg(nickname, msg);
  ctx.body = result;
});

router.get('/heartBeat', async (ctx) => {
  ctx.body = await heartBeatDetect();
});

router.get('/contactList', async (ctx) => {
  ctx.body = getContactList();
});

showQRcode().then(() => {
  logger.info('QRcode scan success!');
  app
    .use(bodyparser())
    .use(koaStatic(`${__dirname}/static`))
    .use(router.routes())
    .listen(config.port);
  console.log(`listening on port ${config.port}`);

  // 心跳检测
  new CronJob('*/25 * * * * *', () => {
    (async () => {
      let result = await heartBeatDetect();
      logger.info(`心跳检测 ${result ? '成功' : '失败'} ${new Date()}`);
    })();
  }, null, true, TZ);
}, (err) => {
  console.log(`QRcode scan failed in "${err}"`);
});
