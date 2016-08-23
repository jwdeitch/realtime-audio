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
        stream.write("https://a.rsa.pub/" + rndId + ".wav");

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
                fileWriter.end();
                uploadToS3();
                stream.write("processing-complete");
                stream.end();
                client.close();
            }
        });
        // stream.pipe(fileWriter);
    });

    function uploadToS3() {
        // http://stackoverflow.com/a/28081647/4603498 thanks to this guy on SO
        fs.readFile("recordings/" + rndId + ".wav", function (err, data) {
            if (err) throw err; // Something went wrong!
            var s3bucket = new AWS.S3({params: {Bucket: 'a.rsa.pub'}});
            s3bucket.createBucket(function () {
                var params = {
                    Key: rndId + ".wav", //file.name doesn't exist as a property
                    Body: data
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
                        // res.status(500).send(err);
                    } else {
                        console.log('Successfully uploaded data');
                        // res.status(200).end();
                    }
                });
            });
        });
    }

    client.on('close', function () {
        if (fileWriter != null) {
            fileWriter.end();
        }
        console.log("Connection Closed");
    });
});
