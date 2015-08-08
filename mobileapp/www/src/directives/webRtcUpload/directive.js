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


                var ws_url = (CLIENT_SETTINGS.SERVER_URL+'/one2many').replace('https','ws').replace('http','ws')
                console.log("websocket url", ws_url);

                var ws = new WebSocket(ws_url);
                var videoOutput = $(element).find('.uploadVideoOutput')[0];
                var webRtcPeer;

    
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

                ws.onmessage = function(message) {
                  var parsedMessage = JSON.parse(message.data);
                  console.info('Received message: ' + message.data);

                  switch (parsedMessage.id) {
                  case 'presenterResponse':
                    presenterResponse(parsedMessage);
                    break;
                  case 'viewerResponse':
                    viewerResponse(parsedMessage);
                    break;
                  case 'stopCommunication':
                    dispose();
                    break;
                  case 'iceCandidate':
                    webRtcPeer.addIceCandidate(parsedMessage.candidate)
                    break;
                  default:
                    console.error('Unrecognized message', parsedMessage);
                  }
                }

                function presenterResponse(message) {
                  if (message.response != 'accepted') {
                    var errorMsg = message.message ? message.message : 'Unknow error';
                    console.warn('Call not accepted for the following reason: ' + errorMsg);
                    dispose();
                  } else {
                    webRtcPeer.processAnswer(message.sdpAnswer);
                  }
                }

                function viewerResponse(message) {
                  if (message.response != 'accepted') {
                    var errorMsg = message.message ? message.message : 'Unknow error';
                    console.warn('Call not accepted for the following reason: ' + errorMsg);
                    dispose();
                  } else {
                    webRtcPeer.processAnswer(message.sdpAnswer);
                  }
                }

                function presenter() {
                  if (!webRtcPeer) {
                    showSpinner(videoOutput);

                    var options = {
                      localVideo: videoOutput,
                      onicecandidate : onIceCandidate
                      }

                    webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendonly(options, function(error) {
                      if(error) return onError(error);
                      this.generateOffer(onOfferPresenter);
                    });
                  }
                }

                function onOfferPresenter(error, offerSdp) {
                  if (error) return onError(error);

                  var message = {
                    id : 'presenter',
                    recordingId: $scope.recordingId,
                    sdpOffer : offerSdp
                  };
                  sendMessage(message);
                }

                /*
                function viewer() {
                  if (!webRtcPeer) {
                    showSpinner(videoOutput);

                    var options = {
                      remoteVideo: videoOutput,
                      onicecandidate : onIceCandidate
                    }

                    webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
                      if(error) return onError(error);

                      this.generateOffer(onOfferViewer);
                    });
                  }
                }

                function onOfferViewer(error, offerSdp) {
                  if (error) return onError(error)

                  var message = {
                    id : 'viewer',
                    recordingId: $scope.recordingId,
                    sdpOffer : offerSdp
                  }
                  sendMessage(message);
                }
                */

                function onIceCandidate(candidate) {
                     console.log('Local candidate' + JSON.stringify(candidate));

                     var message = {
                        id : 'onIceCandidate',
                        candidate : candidate
                     }
                     sendMessage(message);
                }

                function stop() {
                  if (webRtcPeer) {
                    var message = {
                        id : 'stop'
                    }
                    sendMessage(message);
                    $scope.stopRecording = function(){};
                    dispose();
                  }
                }

                function dispose() {
                  if (webRtcPeer) {
                    webRtcPeer.dispose();
                    webRtcPeer = null;
                  }
                  videoOutput.src = "";
                  $scope.recordingState = false;
                  hideSpinner(videoOutput);
                }

                function sendMessage(message) {
                  var jsonMessage = JSON.stringify(message);
                  console.log('Senging message: ' + jsonMessage);
                  ws.send(jsonMessage);
                }

                function showSpinner() {
                  for (var i = 0; i < arguments.length; i++) {
                    arguments[i].poster = 'assets/img//transparent-1px.png';
                    arguments[i].style.background = 'center transparent url("assets/img/spinner.gif") no-repeat';
                  }
                }

                function hideSpinner() {
                  for (var i = 0; i < arguments.length; i++) {
                    arguments[i].src = '';
                    arguments[i].poster = 'assets/img/uploadVideoPlaceholder.png';
                    arguments[i].style.background = '';
                  }
                }

                presenter();
                $scope.onRecordingStart({"recordingId": $scope.recordingId});

                $scope.stopRecording = function(){
                  console.log("Stopping recording");
                  stop();
                };


            }


        }
    }
    
  });
  
  
})();