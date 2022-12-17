import Cors from '@koa/cors';
import Router from '@koa/router';
import Koa from 'koa';
import Parser from 'koa-bodyparser';

const PORT = 8000;
const app = new Koa();
const router = new Router();

app.use(Parser());
app.use(Cors());
app.listen(PORT);

// router.get('/test', (ctx) => (ctx.body = 'hello test'));
// app.use(router.routes()).use(router.allowedMethods());
// app.listen(PORT);
