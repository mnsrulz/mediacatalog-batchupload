const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/process', ({ res }) => {
  res.send('we are on it...');
})

app.get('*', ({ res }) => {
  res.send('welcome!!!');
})

app.listen(port, () => {
  console.log(`App is listening on ${port}`);
})
