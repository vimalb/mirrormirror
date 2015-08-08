document.APP_MODULES = document.APP_MODULES || [];

(function(){

var DIRECTIVE_URL = document.currentScript.src;
var TEMPLATE_URL = DIRECTIVE_URL.replace('directive.js','view.html');
var DIRECTIVE_PATH = URI(DIRECTIVE_URL).path();
DIRECTIVE_PATH = DIRECTIVE_PATH.substring(DIRECTIVE_PATH.indexOf('/src/directives/'));

var MODULE_NAME = 'mainApp'+DIRECTIVE_PATH.replace('/src','').replace('/directive.js','').replace(/\//g,'.');
var DIRECTIVE_NAME = DIRECTIVE_PATH.replace('/src/directives/','').replace('/directive.js','').replace(/\//g,'');

document.APP_MODULES.push(MODULE_NAME);



console.log(MODULE_NAME, "Registering directive", DIRECTIVE_NAME);
angular.module(MODULE_NAME, [])
  .directive(DIRECTIVE_NAME, function($http, CLIENT_SETTINGS, SERVER_SETTINGS) {
    console.log("Loading directive", DIRECTIVE_NAME);

    return {
        restrict: 'E', //E = element, A = attribute, C = class, M = comment         
        scope: {
            //@ reads the attribute value, = provides two-way binding, & works with functions

            // function(recordingId)
            startRecordingFn: '=?',
            finishRecordingFn: '=?',
            cancelRecordingFn: '=?',
            getScreenshotFn: '=?',
            recordingState: '=?',
            recordingId: '=?',
            onRecordingStart: '&',
            onRecordingFinish: '&',

            },
        templateUrl: TEMPLATE_URL,
        link: function ($scope, element, attrs) { 

            $scope.recordingId = undefined;
            $scope.recordingState = false;

            $scope.startRecordingFn = function() {
              if(!$scope.recordingState) {
                $scope.startRecording();
              }
            }

            $scope.finishRecordingFn = function() {
              if($scope.recordingState) {
                $scope.stopRecording();
                $scope.onRecordingFinish({"recordingId": $scope.recordingId});
              }
            }

            $scope.cancelRecordingFn = function() {
              if($scope.recordingState) {
                $scope.stopRecording();
              }
            }

            $scope.getScreenshotFn = function() {
              if($scope.recordingState) {
                return $scope.getScreenshot();
              }
            }



            var getRecordingId = function() {
                var d = new Date().getTime();
                var uuid = 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                    var r = (d + Math.random()*16)%16 | 0;
                    d = Math.floor(d/16);
                    return (c=='x' ? r : (r&0x3|0x8)).toString(16);
                });
                return uuid;
            }


            $scope.stopRecording = function(){};

            $scope.startRecording = function() {
                $scope.recordingState = true;

                console.log(CLIENT_SETTINGS.WEBRTC_SERVER_URL);
    
                var videoOutput = $(element).find('.uploadVideoOutput')[0];

                var thumbnailCanvas = $(element).find('.uploadVideoThumbnail')[0];
                thumbnailCanvas.width = videoOutput.width;
                thumbnailCanvas.height = videoOutput.height;
                var thumbnailCtx = thumbnailCanvas.getContext("2d");
                $scope.getScreenshot = function() {
                  thumbnailCtx.drawImage(videoOutput, 0, 0, videoOutput.width, videoOutput.height);
                  return thumbnailCanvas.toDataURL("image/png");
                }


                $scope.recordingId = getRecordingId();
                var fileUri = 'file://'+SERVER_SETTINGS.RECORDING_ROOT+'/'+$scope.recordingId+'.webm'
                console.log("Recording to", fileUri);

                var args = {
                  ws_uri: CLIENT_SETTINGS.WEBRTC_SERVER_URL+'?cachebuster='+((new Date()).getTime().toString()),
                  file_uri: fileUri,
                  ice_servers: undefined
                };

                var options = {
                  remoteVideo: videoOutput
                };

                if (args.ice_servers) {
                  console.log("Use ICE servers: " + args.ice_servers);
                  options.configuration = {
                    iceServers : JSON.parse(args.ice_servers)
                  };
                } else {
                  console.log("Use freeice")
                }

                var setIceCandidateCallbacks = function(webRtcPeer, webRtcEp, onerror)
                {
                  webRtcPeer.on('icecandidate', function(candidate) {
                    console.log("Local candidate:",candidate);
                    candidate = kurentoClient.register.complexTypes.IceCandidate(candidate);
                    webRtcEp.addIceCandidate(candidate, onerror)
                  });

                  webRtcEp.on('OnIceCandidate', function(event) {
                    var candidate = event.candidate;
                    console.log("Remote candidate:",candidate);
                    webRtcPeer.addIceCandidate(candidate, onerror);
                  });
                }

                var onError = function(){};


                var webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(options, function(error)
                {
                  if(error) return onError(error)
                  this.generateOffer(onOffer)
                });


                function onOffer(error, offer) {
                    if (error) return onError(error);

                    console.log("Offer...");

                    kurentoClient(args.ws_uri, function(error, client) {
                      if (error) return onError(error);

                      client.create('MediaPipeline', function(error, pipeline) {
                        if (error) return onError(error);


                        var elements =
                        [
                          {type: 'RecorderEndpoint', params: {uri : args.file_uri}},
                          {type: 'WebRtcEndpoint', params: {}}
                        ]

                        pipeline.create(elements, function(error, elements){
                          if (error) return onError(error);

                          var recorder = elements[0]
                          var webRtc   = elements[1]

                          setIceCandidateCallbacks(webRtcPeer, webRtc, onError)

                          webRtc.processOffer(offer, function(error, answer) {
                            if (error) return onError(error);

                            console.log("offer");

                            webRtc.gatherCandidates(onError);
                            webRtcPeer.processAnswer(answer);
                          });

                          client.connect(webRtc, webRtc, recorder, function(error) {
                            if (error) return onError(error);

                            console.log("Connected");

                            recorder.record(function(error) {
                              if (error) return onError(error);

                              console.log("record");

                              $scope.onRecordingStart({"recordingId": $scope.recordingId});
                              $scope.stopRecording = function(event){
                                console.log("Stopping recording");
                                recorder.stop();
                                pipeline.release();
                                webRtcPeer.dispose();
                                videoOutput.src = "";
                                $scope.recordingState = false;
                                $scope.stopRecording = function(){};
                              };

                            });
                          });
                        });
                      });
                    });

                }
            }


        }
    }
    
  });
  
  
})();