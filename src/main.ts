import { BatchUploadRequestProcessor } from "./BatchUploadRequestProcessor";

import express from 'express';
const app = express();
const port = process.env.PORT || 3000;

(async () => {
  try {
    const client = new BatchUploadRequestProcessor();
    await client.process();
  } catch (error) {
    console.log(error);
  }
})();

app.get('/process', (req, res) => {
  res.send('we are on it...');
})

app.get('*', (req, res) => {
  res.send('welcome!!!');
})

app.listen(port, () => {
  console.log(`App is listening on ${port}`);
})
