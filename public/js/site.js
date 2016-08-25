$(function () {
    var client,
        recorder,
        context,
        bStream,
        contextSampleRate = (new AudioContext()).sampleRate;
    resampleRate = contextSampleRate;
    worker = new Worker('js/worker/resampler-worker.js');
    //https://svc.rsa.pub/recent
    worker.postMessage({cmd: "init", from: contextSampleRate, to: resampleRate});

    worker.addEventListener('message', function (e) {
        if (bStream && bStream.writable)
            bStream.write(convertFloat32ToInt16(e.data.buffer));
    }, false);

    var link = "NA";
    var timerInterval = 0;
    var sec = 0;

    $(document.body).on('click', '.start-rec-btn', function () {
        $(this).removeClass('start-rec-btn').addClass('btn-danger').removeClass('btn-primary').addClass('stop-rec-btn').text('Stop');
        initializeClock();
        client = new BinaryClient('wss://' + location.host);
        client.on('open', function () {
            bStream = client.createStream({sampleRate: resampleRate});
            bStream.on('data', function (data) {
                console.log(data);
                if (data == "s3UploadComplete") {
                    console.log("s3UploadComplete");
                    showPlayer();
                } else {
                    link = data;
                }
            });
        });

        if (context) {
            recorder.connect(context.destination);
            return;
        }

        var session = {
            audio: true,
            video: false
        };


        navigator.getUserMedia(session, function (stream) {
            context = new AudioContext();
            var audioInput = context.createMediaStreamSource(stream);
            var bufferSize = 0; // let implementation decide

            recorder = context.createScriptProcessor(bufferSize, 1, 1);

            recorder.onaudioprocess = onAudio;

            audioInput.connect(recorder);

            recorder.connect(context.destination);

        }, function (e) {

        });
    });

    function onAudio(e) {
        var left = e.inputBuffer.getChannelData(0);

        worker.postMessage({cmd: "resample", buffer: left});

        drawBuffer(left);
    }

    function convertFloat32ToInt16(buffer) {
        var l = buffer.length;
        var buf = new Int16Array(l);
        while (l--) {
            buf[l] = Math.min(1, buffer[l]) * 0x7FFF;
        }
        return buf.buffer;
    }

    //https://github.com/cwilso/Audio-Buffer-Draw/blob/master/js/audiodisplay.js
    function drawBuffer(data) {
        var canvas = document.getElementById("canvas"),
            width = canvas.width,
            height = canvas.height,
            context = canvas.getContext('2d');

        context.clearRect(0, 0, width, height);
        var step = Math.ceil(data.length / width);
        var amp = height / 2;
        for (var i = 0; i < width; i++) {
            var min = 1.0;
            var max = -1.0;
            for (var j = 0; j < step; j++) {
                var datum = data[(i * step) + j];
                if (datum < min)
                    min = datum;
                if (datum > max)
                    max = datum;
            }
            context.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
        }
    }

    $(document.body).on('click', '.stop-rec-btn', function () {
        $(this).removeClass('stop-rec-btn').removeClass('btn-danger').addClass('btn-primary').addClass('start-rec-btn').text('Rec.');
        close();
        $('#canvas-container, #timeRemaining').hide();
        clearInterval(timerInterval);
        $('#linkBox').show();
        $('#linkBox .linkInput').val(link).focus().select().focus(function() { $(this).select(); } );
        $('.review').html('<div class="ui active centered inline loader"></div>');
        sec = 0;
    });

    function showPlayer() {
        $('.review').html('<audio controls><source src=' + link + ' type="audio/wav"></audio>');
        players = plyr.setup();
    }

    function close() {
        console.log('close');
        if (recorder)
            recorder.disconnect();
        if (client)
            bStream.write("stopSignal");
        // client.close();
    }

    // Thanks! http://stackoverflow.com/a/38598724/4603498
    function sectostr(time) {
        return ~~(time / 60) + ":" + (time % 60 < 10 ? "0" : "") + time % 60;
    }

    function initializeClock() {
        timerInterval = setInterval(function () {
            sec = sec + 1;
            $("#minutes").html(sectostr(sec));
            if (sec == 600) {
                $('.stop-rec-btn').click();
            }
        }, 1000);
    }

});

navigator.getUserMedia = navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia;