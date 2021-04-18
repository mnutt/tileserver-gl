class BadRequestError extends Error {}
class NotFoundError extends Error {}

exports.asyncRoute = function asyncRoute(fn) {
  return async function asyncRouteWrapper(req, res, next) {
    try {
      await fn(req, res, next);
    } catch (error) {
      if (error instanceof BadRequestError) {
        res.status(400).end(error.message);
      } else if (error instanceof NotFoundError) {
        res.status(404).end(error.message || "Not found");
      } else {
        console.error(error);
        res.sendStatus(500);
      }
    }
  };
};

exports.BadRequestError = BadRequestError;
exports.NotFoundError = NotFoundError;
