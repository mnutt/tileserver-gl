var lru = require("lru-cache");

module.exports = new lru({max: 1000, maxAge: 1000 * 60 * 60});

if(process.env.DEBUG_CACHE) {
 setInterval(function() {
   console.log("Marker cache has " + module.exports.length + " items.");
 }, 60*1000);
}
