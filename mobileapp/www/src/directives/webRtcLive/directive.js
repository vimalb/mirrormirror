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

            recordingId: '=',
            startPlayFn: '=?',
            stopPlayFn: '=?',
            playingState: '=?',
            },
        templateUrl: TEMPLATE_URL,
        link: function ($scope, element, attrs) { 
            $scope.playingState = false;

            $scope.startPlayFn = function() {
              if(!$scope.playingState) {
                console.log("Live streaming", $scope.recordingId);
                $scope.startPlaying();
              }
            }

            $scope.stopPlayFn = function() {
              if($scope.playingState) {
                $scope.stopPlaying();
              }
            }


            $scope.stopPlaying = function(){};

            $scope.startPlaying = function() {
                $scope.playingState = true;


                var ws_url = (CLIENT_SETTINGS.SERVER_URL+'/one2many').replace('https','ws').replace('http','ws')
                console.log("websocket url", ws_url);

                var ws = new WebSocket(ws_url);
                var videoOutput = $(element).find('.uploadVideoOutput')[0];
                var webRtcPeer;

                ws.onmessage = function(message) {
                  var parsedMessage = JSON.parse(message.data);
                  console.info('Received message: ' + message.data);

                  switch (parsedMessage.id) {
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
                
                function onError(error) {
                  console.error(error);
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
                    dispose();
                  }
                }

                function dispose() {
                  if (webRtcPeer) {
                    webRtcPeer.dispose();
                    webRtcPeer = null;
                  }
                  videoOutput.src = "";
                  $scope.playingState = false;
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

                viewer();

                $scope.stopPlaying = function(){
                  console.log("Stopping playing");
                  stop();
                };

            }

            $scope.$watch('recordingId', function() {
              $scope.stopPlayFn();
              $scope.startPlayFn();
            });

            $scope.startPlayFn();

        }
    }
    
  });
  
  
})();