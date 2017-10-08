// import _ from 'lodash';
import Koa from 'koa';
import Router from 'koa-router';
import koaStatic from 'koa-static';
import bodyparser from 'koa-bodyparser';
import Pug from 'koa-pug';
import {CronJob} from 'cron';
import config from './config';
import {logger} from './lib/utils';
import {showQRcode, sendMsg, getContactList} from './controllers/index';

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

router.get('/health', async (ctx) => {
  ctx.body = 'OK';
});

router.get('/', async (ctx) => {
  let query = ctx.query;
  let {nickname, msg} = query;
  let result = await sendMsg(nickname, msg);
  ctx.body = result;
  // ctx.render('index', {}, true);
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
  new CronJob('0 0 */1 * * *', () => {
    (async () => {
      let result = await sendMsg('微信团队', '心跳检测');
      logger.info(`心跳检测成功 ${new Date()}`);
      logger.info(JSON.stringify(result, null, 2));
    })();
  }, null, true, TZ);
}, (err) => {
  console.log(`QRcode scan failed in "${err}"`);
});
