const http = require('node:http');
const handler = require('./api/all.js');
const port = Number(process.env.PORT || 4190);
http.createServer(handler).listen(port, '127.0.0.1', () => {
  console.log(`Meu Controle: http://127.0.0.1:${port}`);
});

