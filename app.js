// import _ from 'lodash';
import Koa from 'koa';
import Router from 'koa-router';
import koaStatic from 'koa-static';
import bodyparser from 'koa-bodyparser';
import Pug from 'koa-pug';
import config from './config';

let app = new Koa();
let router = new Router();
new Pug({
  viewPath: `${__dirname}/views`,
  helperPath: [
    { _: require('lodash') },
    { moment: require('moment') }
  ],
  locals: {
    env: 'staging'
  },
  noCache: true,
  app
});

router.get('/health', async (ctx) => {
  ctx.body = 'OK';
});

router.get('/', async (ctx) => {
  ctx.render('index', {}, true);
});

app
  .use(bodyparser())
  .use(koaStatic(`${__dirname}/static`))
  .use(router.routes())
  .listen(config.port);
console.log(`listening on port ${config.port}`);
