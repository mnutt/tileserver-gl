var request       = require('supertest');
var mockery       = require("mockery");

class Map {
  render(params, fn) {
    return fn(null, Buffer.from(JSON.stringify(params)));
  }
  load() {}
}

mockery.enable();
mockery.warnOnUnregistered(false);

mockery.registerMock('@mapbox/mapbox-gl-native', { Map, on: () => {} });
mockery.registerMock('abaculus', function(params, cb) {
  return cb(null, JSON.stringify(params), {'content-type': 'application/json'});
});

mockery.registerMock('markers', {
  fetch: function(marker) {
    return new Buffer("MARKER");
  }
});

let server;
before(() => {
  server = global.app;
})

describe('index routes', function () {
  it('responds to /index.json with json', function testSlash(done) {
    request(server)
      .get('/index.json')
      .expect(200, done);
  });

  it('404 bad urls', function testPath(done) {
    request(server)
      .get('/foo/bar')
      .expect(404, done);
  });
});

describe('static maps centered', function () {
  it('calls mbgl with correct parameters for non-retina', function testCentered(done) {
    request(server)
      .get('/styles/test-style/static/40.0,-73.0,3/200x100.jpg')
      .end(function(err, res) {
        console.log(res.body.toString());
        should(res.body.center.x).equal(40);
        should(res.body.center.y).equal(-73);
        should(res.body.zoom).equal(3);
        should(res.body.center.w).equal(200);
        should(res.body.center.h).equal(100);
        should(res.body.scale).equal(1);
        should(res.body.format).equal('jpg');
        should(res.body.attribute).equal(false);
        done();
      });
  });

  it('calls mbgl with correct parameters for retina', function testCentered(done) {
    request(server)
      .get('/styles/test-style/static/40.0,-73.0,3/200x100@2x.png')
      .end(function(err, res) {
        should(res.body.center.x).equal(40);
        should(res.body.center.y).equal(-73);
        should(res.body.zoom).equal(3);
        should(res.body.center.w).equal(200);
        should(res.body.center.h).equal(100);
        should(res.body.scale).equal(2);
        should(res.body.format).equal('png');
        should(res.body.attribute).equal(false);
        done();
      });
  });

  it('sends attribute property', function testCentered(done) {
    request(server)
      .get('/styles/test-style/static/40.0,-73.0,3/200x100@2x.png?attribute=true')
      .end(function(err, res) {
        should(res.body.attribute).equal(true);
        done();
      });
  });
});

describe('static maps with generated marker', function () {
  it('calls mbgl with generated marker param', function testCentered(done) {
    request(server)
      .get('/styles/test-style/static/pin-s+FF0000(40.1,-73.1)/40.0,-73.0,3/200x100.jpg')
      .end(function(err, res) {
        should(res.body.center.x).equal(40);
        should(res.body.center.y).equal(-73);
        should(res.body.markers[0].url).equal("generated:s+FF0000");
        should(res.body.markers[0].x).equal(40.1);
        should(res.body.markers[0].y).equal(-73.1);
        done();
      });
  });
});

describe('static maps with url marker', function () {
  it('calls mbgl with url marker param', function testCentered(done) {
    request(server)
      .get('/styles/test-style/static/url-http%3A%2F%2Fexample.com%2Ffoo.png%3Fquery%3Dparam(40.1,-73.1)/40.0,-73.0,3/200x100.jpg')
      .end(function(err, res) {
        should(res.body.center.x).equal(40);
        should(res.body.center.y).equal(-73);
        should(res.body.markers[0].url).equal("http://example.com/foo.png?query=param");
        should(res.body.markers[0].x).equal(40.1);
        should(res.body.markers[0].y).equal(-73.1);
        done();
      });
  });
});

describe('static maps with multiple markers', function () {
  it('calls mbgl with marker params', function testCentered(done) {
    request(server)
      .get('/styles/test-style/static/pin-s+FF0000(40.1,-73.1),pin-s+0000FF(39.9,-72.9)/40.0,-73.0,3/200x100.jpg')
      .end(function(err, res) {
        should(res.body.center.x).equal(40);
        should(res.body.center.y).equal(-73);

        should(res.body.markers[0].url).equal("generated:s+FF0000");
        should(res.body.markers[0].x).equal(40.1);
        should(res.body.markers[0].y).equal(-73.1);

        should(res.body.markers[1].url).equal("generated:s+0000FF");
        should(res.body.markers[1].x).equal(39.9);
        should(res.body.markers[1].y).equal(-72.9);
        done();
      });
  });
});

describe('static maps with references', function () {
  it('calls mbgl with dereferenced markers', function testCentered(done) {
    request(server)
      .get('/styles/test-style/static/pin-s+FF0000(40.1,-73.1):1,ref-1(39.9,-72.9),ref-1(39.8,-72.8)/40.0,-73.0,3/200x100.jpg')
      .end(function(err, res) {
        should(res.body.center.x).equal(40);
        should(res.body.center.y).equal(-73);

        should(res.body.markers[0].url).equal("generated:s+FF0000");
        should(res.body.markers[0].x).equal(40.1);
        should(res.body.markers[0].y).equal(-73.1);

        should(res.body.markers[1].url).equal("generated:s+FF0000");
        should(res.body.markers[1].x).equal(39.9);
        should(res.body.markers[1].y).equal(-72.9);

        should(res.body.markers[2].url).equal("generated:s+FF0000");
        should(res.body.markers[2].x).equal(39.8);
        should(res.body.markers[2].y).equal(-72.8);

        done();
      });
  });
});

describe('static maps with bad references', function () {
  it('calls mbgl without those markers', function testCentered(done) {
    request(server)
      .get('/styles/test-style/static/ref-1(39.9,-73.1)/40.0,-73.0,3/200x100.jpg')
      .end(function(err, res) {
        should(res.body.center.x).equal(40);
        should(res.body.center.y).equal(-73);
        should(res.body.markers.length).equal(0);

        done();
      });
  });
});
