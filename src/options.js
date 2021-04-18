const commander = require('commander');
const packageJson = require('../package');

module.exports = function makeOptions(args) {
  return commander
    .description('tileserver-gl startup options')
    .usage('tileserver-gl [mbtiles] [options]')
    .option(
      '--mbtiles <file>',
      'MBTiles file (uses demo configuration);\n' +
        '\t                  ignored if the configuration file is also specified'
    )
    .option(
      '-c, --config <file>',
      'Configuration file [config.json]',
      'config.json'
    )
    .option(
      '-b, --bind <address>',
      'Bind address'
    )
    .option(
      '-p, --port <port>',
      'Port [8080]',
      8080,
      parseInt
    )
    .option(
      '-C|--no-cors',
      'Disable Cross-origin resource sharing headers'
    )
    .option(
      '-u|--public_url <url>',
      'Enable exposing the server on subpaths, not necessarily the root of the domain'
    )
    .option(
      '-V, --verbose',
      'More verbose output'
    )
    .option(
      '-s, --silent',
      'Less verbose output'
    )
    .option(
      '-l|--log_file <file>',
      'output log file (defaults to standard out)'
    )
    .option(
      '-f|--log_format <format>',
      'define the log format:  https://github.com/expressjs/morgan#morganformat-options'
    )
    .option(
      '--prefix <prefix>',
      'path prefix (defaults to /styles/)'
    )
    .version(
      packageJson.version,
      '-v, --version'
    )
    .parse(args);
};
