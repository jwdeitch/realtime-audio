var binaryServer = require('binaryjs').BinaryServer,
    https = require('https'),
    wav = require('wav'),
    fs = require('fs'),
    AWS = require('aws-sdk'),
    connect = require('connect'),
    serveStatic = require('serve-static');

if (!fs.existsSync("recordings"))
    fs.mkdirSync("recordings");

var options = {
    key: fs.readFileSync(process.env.SSL_KEY),
    cert: fs.readFileSync(process.env.SSL_CERT)
};

var app = connect();

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
    var endTime = curTime + 600;
    var rndId = generateRandomId();

    var userIP = client._socket.upgradeReq.headers['x-forwarded-for'];
    fs.appendFile('access.log', userIP + "  -  " + curTime + " - " + rndId + "\r\n");
    client.on('stream', function (stream, meta) {
        stream.write("https://SITE/r/" + rndId + ".wav");

        console.log("Stream Start@" + meta.sampleRate + "Hz");
        var fileName = "recordings/" + rndId + ".wav";

        fileWriter = new wav.FileWriter(fileName, {
            channels: 1,
            sampleRate: meta.sampleRate,
            bitDepth: 16
        });

        stream.on("data", function (data) {
            if (data == "stopSignal") {
                console.log("STOP SIGNAL");
                uploadToS3(stream);
            }
            fileWriter.write(data);
            if (endTime < Math.round(new Date().getTime() / 1000)) {
                console.log("TIME EXPIRED");
                uploadToS3(stream);
            }
        });
        // stream.pipe(fileWriter);
    });

    // http://stackoverflow.com/a/28081647/4603498 thanks to this guy on SO
    function uploadToS3(stream) {
        var s3bucket = new AWS.S3({params: {Bucket: 'a.rsa.pub'}});
        s3bucket.createBucket(function () {
            var params = {
                Key: "r/" + rndId + ".wav", //file.name doesn't exist as a property
                Body: fs.readFileSync("recordings/" + rndId + ".wav"),
                ContentType: "audio/wav"
            };
            s3bucket.upload(params, function (err, data) {
                // Whether there is an error or not, delete the temp file
                fs.unlink("recordings/" + rndId + ".wav", function (err) {
                    if (err) {
                        console.error(err);
                    }
                    console.log('Temp File Delete');
                });

                if (err) {
                    console.log('ERROR MSG: ', err);
                } else {
                    console.log('Successfully uploaded data');
                    stream.write("s3UploadComplete");
                }
                setTimeout(function () {
                    client.close();
                    stream.end();
                }, 1000);
            });
        });
    }

    client.on('close', function (stream) {
        if (fileWriter != null) {
            fileWriter.end();
        }
        console.log("Connection Closed");
    });
});
