var binaryServer = require('binaryjs').BinaryServer,
    https = require('https'),
    wav = require('wav'),
    fs = require('fs'),
    connect = require('connect'),
    serveStatic = require('serve-static');

if (!fs.existsSync("recordings"))
    fs.mkdirSync("recordings");

var options = {
    key: fs.readFileSync(process.env.SSL_KEY),
    cert: fs.readFileSync(process.env.SSL_CERT)
};

var app = connect();

app.use(serveStatic('public'));

var httpServer = https.createServer(options, app);
httpServer.listen(9191);

var wsServer = binaryServer({server: httpServer});

// http://stackoverflow.com/a/1349426/4603498 thx!
function generateRandomId() {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < 10; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return text;
}

wsServer.on('connection', function (client) {
    console.log("new connection...");
    var fileWriter = null;
    var curTime = Math.round(new Date().getTime() / 1000);
    var endTime = curTime + 10;
    var rndId = generateRandomId();

    var userIP = client._socket.upgradeReq.headers['x-forwarded-for'];
    fs.appendFile('access.log', userIP + "  -  " + curTime + " - " + rndId + "\r\n");
    client.on('stream', function (stream, meta) {
        stream.write("https://a.rsa.pub/"+rndId+".wav");

        console.log("Stream Start@" + meta.sampleRate + "Hz");
        var fileName = "recordings/" + rndId + ".wav";

        fileWriter = new wav.FileWriter(fileName, {
            channels: 1,
            sampleRate: meta.sampleRate,
            bitDepth: 16
        });

        stream.on("data", function (data) {
            fileWriter.write(data);
            if (endTime < Math.round(new Date().getTime() / 1000)) {
                console.log("TIME EXPIRED");
                stream.end();
                fileWriter.end();
                client.close();
            }
        });
        // stream.pipe(fileWriter);
    });

    client.on('close', function () {
        if (fileWriter != null) {
            fileWriter.end();
        }
        console.log("Connection Closed");
    });
});
