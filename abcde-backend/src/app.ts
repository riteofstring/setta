import express from 'express';
import { router } from './routers';

const app = express();
const port = 8000;

app.use('/birds', router);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
