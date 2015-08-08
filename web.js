var API_URL = process.env.API_URL || "http://localhost:3000";

var _ = require('lodash-node');
var q = require('q');
var url = require('url');
var express = require('express');
var gzippo = require('gzippo');
var logger = require('morgan');
var bodyParser = require('body-parser');
var fs = require('fs');
var parse = require('csv-parse');
var proxy = require('express-http-proxy');
var handlebars = require("node-handlebars");
var ws = require('ws');
var kurento = require('kurento-client');
var jcopy = function(x){return JSON.parse(JSON.stringify(x));}
var wait = function(duration_ms){
  var deferred = q.defer();
  setTimeout(function(){
    deferred.resolve();
  }, duration_ms);
  return deferred.promise;
}

var CLIENT_SETTINGS_TEMPLATE_FILE = "" + __dirname + "/www/client.settings.template";
var CLIENT_SETTINGS_FILE = "" + __dirname + "/www/client.settings.js";
handlebars.create().engine(CLIENT_SETTINGS_TEMPLATE_FILE, {env: JSON.parse(JSON.stringify(process.env))}, function(err, output) {
  if (err) {
    throw err;
  }
  fs.writeFile(CLIENT_SETTINGS_FILE, output, function(err) {
    if(err) {
      throw err;
    }
    console.log(CLIENT_SETTINGS_FILE, "rendered");
  });
}); 

SERVER_SETTINGS = {'RECORDING_ROOT': "" + __dirname + "/www/recordings" }

var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);

app.use(logger('dev'));


console.log("Starting server");
server.listen(process.env.PORT || 5000, function(){
  console.log("Server started");
});

var shutdown = function(){
  console.log("Shutting down server");
  process.exit();
}
// TERM signal .e.g. kill 
process.on('SIGTERM', shutdown);
// INT signal e.g. Ctrl-C
process.on('SIGINT', shutdown);  



///// WEbsocket stuff
var idCounter = 0;
var noPresenterMessage = 'No active presenter. Try again later...';

var recordingScopes = {}
var sessionToRecordingMap = {}
function fetchScope(recordingId) {
    if(!recordingScopes[recordingId]) {
        recordingScopes[recordingId] = { 
            candidatesQueue: {},
            kurentoClient: null,
            presenter: null,
            recorder: null,
            viewers: []
        }
    }
    return recordingScopes[recordingId];
}

var wss = new ws.Server({
    server : server,
    path : '/one2many'
});

function nextUniqueId() {
	idCounter++;
	return idCounter.toString();
}

wss.on('connection', function(ws) {

	var sessionId = nextUniqueId();
	console.log('Connection received with sessionId ' + sessionId);

    ws.on('error', function(error) {
        console.log('Connection ' + sessionId + ' error');
        stop(sessionId);
    });

    ws.on('close', function() {
        console.log('Connection ' + sessionId + ' closed');
        stop(sessionId);
    });

    ws.on('message', function(_message) {
        var message = JSON.parse(_message);
        console.log('Connection ' + sessionId + ' received message ', message);

        switch (message.id) {
        case 'presenter':
			startPresenter(message.recordingId, sessionId, ws, message.sdpOffer, function(error, sdpAnswer) {
				if (error) {
					return ws.send(JSON.stringify({
						id : 'presenterResponse',
						response : 'rejected',
						message : error
					}));
				}
				ws.send(JSON.stringify({
					id : 'presenterResponse',
					response : 'accepted',
					sdpAnswer : sdpAnswer
				}));
			});
			break;

        case 'viewer':
			startViewer(message.recordingId, sessionId, ws, message.sdpOffer, function(error, sdpAnswer) {
				if (error) {
					return ws.send(JSON.stringify({
						id : 'viewerResponse',
						response : 'rejected',
						message : error
					}));
				}

				ws.send(JSON.stringify({
					id : 'viewerResponse',
					response : 'accepted',
					sdpAnswer : sdpAnswer
				}));
			});
			break;

        case 'stop':
            stop(sessionId);
            break;

        case 'onIceCandidate':
            onIceCandidate(sessionId, message.candidate);
            break;

        default:
            ws.send(JSON.stringify({
                id : 'error',
                message : 'Invalid message ' + message
            }));
            break;
        }
    });
});


/*
 * Definition of functions
 */

// Recover kurentoClient for the first time.
function getKurentoClient(recordingId, callback) {
    if (fetchScope(recordingId).kurentoClient !== null) {
        return callback(null, fetchScope(recordingId).kurentoClient);
    }

    kurento(process.env.WEBRTC_SERVER_URL, function(error, _kurentoClient) {
        if (error) {
            console.log("Could not find media server at address " + process.env.WEBRTC_SERVER_URL);
            return callback("Could not find media server at address" + process.env.WEBRTC_SERVER_URL
                    + ". Exiting with error " + error);
        }

        fetchScope(recordingId).kurentoClient = _kurentoClient;
        callback(null, fetchScope(recordingId).kurentoClient);
    });
}

function startPresenter(recordingId, sessionId, ws, sdpOffer, callback) {
    sessionToRecordingMap[sessionId] = recordingId;
	clearCandidatesQueue(sessionId);

	if (fetchScope(recordingId).presenter !== null) {
		stop(sessionId);
		return callback("Another user is currently acting as presenter. Try again later ...");
	}

	fetchScope(recordingId).presenter = {
		id : sessionId,
		pipeline : null,
		webRtcEndpoint : null
	}

	getKurentoClient(recordingId, function(error, kurentoClient) {
		if (error) {
			stop(sessionId);
			return callback(error);
		}

		if (fetchScope(recordingId).presenter === null) {
			stop(sessionId);
			return callback(noPresenterMessage);
		}

		kurentoClient.create('MediaPipeline', function(error, pipeline) {
			if (error) {
				stop(sessionId);
				return callback(error);
			}

			if (fetchScope(recordingId).presenter === null) {
				stop(sessionId);
				return callback(noPresenterMessage);
			}

			fetchScope(recordingId).presenter.pipeline = pipeline;
			pipeline.create('WebRtcEndpoint', function(error, webRtcEndpoint) {
				if (error) {
					stop(sessionId);
					return callback(error);
				}

				if (fetchScope(recordingId).presenter === null) {
					stop(sessionId);
					return callback(noPresenterMessage);
				}

				fetchScope(recordingId).presenter.webRtcEndpoint = webRtcEndpoint;
                
                fetchScope(recordingId).presenter.pipeline.create('RecorderEndpoint', {uri : 'file://'+SERVER_SETTINGS.RECORDING_ROOT+'/'+recordingId+'.webm'}, function(error, recorder) {
                    fetchScope(recordingId).presenter.webRtcEndpoint.connect(recorder, function(error) {
                        if (error) {
                            stop(sessionId);
                            return callback(error);
                        }
                        if (fetchScope(recordingId).presenter === null) {
                            stop(sessionId);
                            return callback(noPresenterMessage);
                        }
                        recorder.record(function(error) {
                            if (error) {
                                stop(sessionId);
                                return callback(error);
                            }
                            fetchScope(recordingId).recorder = recorder;
                        });
                    });
                });


                if (fetchScope(recordingId).candidatesQueue[sessionId]) {
                    while(fetchScope(recordingId).candidatesQueue[sessionId].length) {
                        var candidate = fetchScope(recordingId).candidatesQueue[sessionId].shift();
                        webRtcEndpoint.addIceCandidate(candidate);
                    }
                }

                webRtcEndpoint.on('OnIceCandidate', function(event) {
                    var candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
                    ws.send(JSON.stringify({
                        id : 'iceCandidate',
                        candidate : candidate
                    }));
                });

				webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer) {
					if (error) {
						stop(sessionId);
						return callback(error);
					}

					if (fetchScope(recordingId).presenter === null) {
						stop(sessionId);
						return callback(noPresenterMessage);
					}

					callback(null, sdpAnswer);
				});

                webRtcEndpoint.gatherCandidates(function(error) {
                    if (error) {
                        stop(sessionId);
                        return callback(error);
                    }
                });
            });
        });
	});
}

function startViewer(recordingId, sessionId, ws, sdpOffer, callback) {
    sessionToRecordingMap[sessionId] = recordingId;
	clearCandidatesQueue(sessionId);

	if (fetchScope(recordingId).presenter === null) {
		stop(sessionId);
		return callback(noPresenterMessage);
	}

	fetchScope(recordingId).presenter.pipeline.create('WebRtcEndpoint', function(error, webRtcEndpoint) {
		if (error) {
			stop(sessionId);
			return callback(error);
		}
		fetchScope(recordingId).viewers[sessionId] = {
			"webRtcEndpoint" : webRtcEndpoint,
			"ws" : ws
		}

		if (fetchScope(recordingId).presenter === null) {
			stop(sessionId);
			return callback(noPresenterMessage);
		}

		if (fetchScope(recordingId).candidatesQueue[sessionId]) {
			while(fetchScope(recordingId).candidatesQueue[sessionId].length) {
				var candidate = fetchScope(recordingId).candidatesQueue[sessionId].shift();
				webRtcEndpoint.addIceCandidate(candidate);
			}
		}

        webRtcEndpoint.on('OnIceCandidate', function(event) {
            var candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
            ws.send(JSON.stringify({
                id : 'iceCandidate',
                candidate : candidate
            }));
        });

		webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer) {
			if (error) {
				stop(sessionId);
				return callback(error);
			}
			if (fetchScope(recordingId).presenter === null) {
				stop(sessionId);
				return callback(noPresenterMessage);
			}

			fetchScope(recordingId).presenter.webRtcEndpoint.connect(webRtcEndpoint, function(error) {
				if (error) {
					stop(sessionId);
					return callback(error);
				}
				if (fetchScope(recordingId).presenter === null) {
					stop(sessionId);
					return callback(noPresenterMessage);
				}

				callback(null, sdpAnswer);
		        webRtcEndpoint.gatherCandidates(function(error) {
		            if (error) {
			            stop(sessionId);
			            return callback(error);
		            }
		        });
		    });
	    });
	});
}

function clearCandidatesQueue(sessionId) {
    recordingId = sessionToRecordingMap[sessionId];
	if (fetchScope(recordingId).candidatesQueue[sessionId]) {
		delete fetchScope(recordingId).candidatesQueue[sessionId];
	}
}

function stop(sessionId) {
    recordingId = sessionToRecordingMap[sessionId];
	if (fetchScope(recordingId).presenter !== null && fetchScope(recordingId).presenter.id == sessionId) {
		for (var i in fetchScope(recordingId).viewers) {
			var viewer = fetchScope(recordingId).viewers[i];
			if (viewer.ws) {
				viewer.ws.send(JSON.stringify({
					id : 'stopCommunication'
				}));
			}
		}
        if (fetchScope(recordingId).recorder) {
            fetchScope(recordingId).recorder.stop();
        }
		fetchScope(recordingId).presenter.pipeline.release();
		fetchScope(recordingId).presenter = null;
		fetchScope(recordingId).recorder = null;
		fetchScope(recordingId).viewers = [];
	} else if (fetchScope(recordingId).viewers[sessionId]) {
		delete fetchScope(recordingId).viewers[sessionId];
	}

	clearCandidatesQueue(sessionId);
}

function onIceCandidate(sessionId, _candidate) {
    recordingId = sessionToRecordingMap[sessionId];
    var candidate = kurento.register.complexTypes.IceCandidate(_candidate);

    if (fetchScope(recordingId).presenter && fetchScope(recordingId).presenter.id === sessionId && fetchScope(recordingId).presenter.webRtcEndpoint) {
        console.info('Sending presenter candidate');
        fetchScope(recordingId).presenter.webRtcEndpoint.addIceCandidate(candidate);
    }
    else if (fetchScope(recordingId).viewers[sessionId] && fetchScope(recordingId).viewers[sessionId].webRtcEndpoint) {
        console.info('Sending viewer candidate');
        fetchScope(recordingId).viewers[sessionId].webRtcEndpoint.addIceCandidate(candidate);
    }
    else {
        console.info('Queueing candidate');
        if (!fetchScope(recordingId).candidatesQueue[sessionId]) {
            fetchScope(recordingId).candidatesQueue[sessionId] = [];
        }
        fetchScope(recordingId).candidatesQueue[sessionId].push(candidate);
    }
}










///// End WEbsocket stuff



app.use('/api', proxy(API_URL, {
  forwardPath: function(req, res) {
    return '/api'+require('url').parse(req.url).path;
  }
}));


app.get('/settings/server', function(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  res.json(SERVER_SETTINGS);
});




app.use(gzippo.staticGzip("" + __dirname + "/www"));

io.on('connection', function (socket) {
  socket.emit('hello', {'hello':'nice to have you'});
});

