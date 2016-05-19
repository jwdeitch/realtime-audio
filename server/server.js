/**
 * Created by noamc on 8/31/14.
 */
var binaryServer = require('binaryjs').BinaryServer,
    https = require('https'),
    wav = require('wav'),
    opener = require('opener'),
    fs = require('fs'),
    connect = require('connect'),
    serveStatic = require('serve-static'),
    UAParser = require('./ua-parser');

var uaParser = new UAParser();

if (!fs.existsSync("recordings"))
    fs.mkdirSync("recordings");

var options = {
    key: fs.readFileSync('ssl/server.key'),
    cert: fs.readFileSync('ssl/server.crt')
};

var app = connect();

app.use(serveStatic('public'));

var httpServer = https.createServer(options, app);
httpServer.listen(9191);

opener("https://localhost:9191");

var wsServer = binaryServer({server: httpServer});

wsServer.on('connection', function (client) {
    console.log("new connection...");
    var fileWriter = null;

    var userIP = client._socket.upgradeReq.connection.remoteAddress;

    client.on('stream', function (stream, meta) {

        console.log("Stream Start@" + meta.sampleRate + "Hz");
        var fileName = "recordings/" + userIP + "_" + new Date().getTime() + ".wav";

        fileWriter = new wav.FileWriter(fileName, {
            channels: 1,
            sampleRate: meta.sampleRate,
            bitDepth: 16
        });

        stream.pipe(fileWriter);
    });

    client.on('close', function () {
        if (fileWriter != null) {
            fileWriter.end();
        }
        console.log("Connection Closed");
    });
});
