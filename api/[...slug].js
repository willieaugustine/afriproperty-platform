const { app } = require('../backend/server');

module.exports = (req, res) => {
  // Express app is a function (req, res) so forward request
  return app(req, res);
};
