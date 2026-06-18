const serverless = require('serverless-http');
const app = require('../server');

module.exports = serverless(app, {
  binary: ['multipart/form-data', 'application/octet-stream']
});
