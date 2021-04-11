const FontManager = require('../font_manager');
const fontManager = FontManager.instance;

module.exports = () => {
  async function fontStackRoute(req, res, next) {
    const { fontstack, range } = req.params;

    try {
      const concated = await fontManager.getFontsPbf(decodeURI(fontstack), range);

      res.header('Content-type', 'application/x-protobuf');
      res.header('Last-Modified', fontManager.lastModified);
      return res.send(concated);
    } catch (e) {
      res.status(400).send(err);
    }
  }

  function fontListRoute(req, res, next) {
    res.header('Content-type', 'application/json');

    return res.send(fontManager.list());
  }

  return { fontStack: fontStackRoute, fontList: fontListRoute };
}
