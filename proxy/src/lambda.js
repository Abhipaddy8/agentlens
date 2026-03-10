const { handler } = require("./handler");

exports.handler = async (event) => {
  return handler(event);
};
