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
                $scope.recordingId = getRecordingId();

                console.log(CLIENT_SETTINGS.WEBRTC_SERVER_URL);
    

                $scope.onRecordingStart({"recordingId": $scope.recordingId});
                $scope.stopRecording = function(event){
                  console.log("Stopping recording");
                  $scope.recordingState = false;
                  $scope.stopRecording = function(){};
                };
                  
            }


        }
    }
    
  });
  
  
})();