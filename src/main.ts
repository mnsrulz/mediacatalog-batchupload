import {startProcessing, signal} from "./BatchUploadRequestProcessor";

import express from 'express';
const app = express();
const port = process.env.PORT || 3000;

(async () => {
  try {
    await startProcessing();
  } catch (error) {
    console.log(error);
  }
})();

app.get('/process', (req, res) => {
  res.send('we are on it...');
})

app.get('/trigger', (req, res) => {
  signal();
  res.send('Ack!!!');
})

app.get('*', (req, res) => {
  res.send('welcome!!!');
})

app.listen(port, () => {
  console.log(`App is listening on ${port}`);
})
