#!/usr/bin/env node
/* Статический сервер игры: раздаёт папку по локальной сети,
   чтобы открыть её в Safari на iPhone (тот же Wi-Fi). */
"use strict";
var http = require("http");
var fs = require("fs");
var path = require("path");
var os = require("os");

var ROOT = __dirname;
var PORT = process.env.PORT || 8123;

var MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".md": "text/plain; charset=utf-8"
};

http.createServer(function (req, res) {
  var urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  console.log("[" + req.socket.remoteAddress + "] GET " + req.url.slice(0, 90));
  if (urlPath === "/beat" || urlPath === "/err") {
    res.writeHead(200, { "Content-Type": "image/gif" });
    res.end();
    return;
  }
  var filePath = path.join(ROOT, path.normalize(urlPath));
  if (filePath.indexOf(ROOT) !== 0) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, function (err, data) {
    if (err) { res.writeHead(404); res.end("404"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, "0.0.0.0", function () {
  console.log("Brawl Arena: http://localhost:" + PORT);
  var nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (name) {
    nets[name].forEach(function (n) {
      if (n.family === "IPv4" && !n.internal) {
        console.log("для iPhone в той же Wi-Fi сети: http://" + n.address + ":" + PORT);
      }
    });
  });
});
