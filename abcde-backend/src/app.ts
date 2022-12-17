import Cors from '@koa/cors';
import Koa from 'koa';
import Parser from 'koa-bodyparser';
import { router } from './routers';

const PORT = 8000;
const app = new Koa();

app.use(Parser());
app.use(Cors());
app.use(router.routes());
app.use(router.allowedMethods());
app.listen(PORT);
