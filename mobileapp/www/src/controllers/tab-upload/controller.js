document.APP_MODULES = document.APP_MODULES || [];

(function(){

var CONTROLLER_URL = document.currentScript.src;
var TEMPLATE_URL = CONTROLLER_URL.replace('controller.js','view.html');
var CONTROLLER_PATH = URI(CONTROLLER_URL).path();
CONTROLLER_PATH = CONTROLLER_PATH.substring(CONTROLLER_PATH.indexOf('/src/controllers/'));

var ROUTE_URL = '/upload';
var MODULE_NAME = 'mainApp'+CONTROLLER_PATH.replace('/src','').replace('/controller.js','').replace(/\//g,'.');
var CONTROLLER_NAME = MODULE_NAME.replace(/\./g,'_').replace(/-/g,'_');
document.APP_MODULES.push(MODULE_NAME);

console.log(MODULE_NAME, "Registering route", ROUTE_URL);
angular.module(MODULE_NAME, ['ionic'])
    .config(function($stateProvider) {
    $stateProvider.state('tab.upload', {
        url: ROUTE_URL,
        views: {
          'tab-upload': {
            templateUrl: TEMPLATE_URL,
            controller: CONTROLLER_NAME
          }
        }
      });
    })
    .controller(CONTROLLER_NAME, function($scope, $rootScope, $state, videoSearchService, userService, $timeout, $interval) {
      // states: ['register','record','review','share']
      $scope.uploadState = 'register';
      $scope.recordingId = undefined;
      $scope.recordControl = {
          startRecording: function(){},
          finishRecording: function(){}, 
          cancelRecording: function(){},
          getScreenshot: function(){},
          recordingState: false,
      }

      $scope.resetUpload = function() {
        $scope.recordControl.cancelRecording()
        $scope.uploadState = 'register';
        if($scope.recordingInfo && $scope.recordingInfo.state == 'live') {
          $scope.recordingInfo.state = 'canceled';
          videoSearchService.update($scope.recordingInfo);
        }
        if($scope.thumbInterval) {
          $interval.cancel($scope.thumbInterval);
          $scope.thumbInterval = undefined;
        }
        $scope.recordingInfo = {
          recordingId: undefined,
          state: undefined,
          uploadUser: userService.getCurrentUser(),
          title: "",
          tags: [],
          thumbnails: {},
        }
        console.log($scope.recordingInfo);
      }
      $scope.resetUpload();
      

      $scope.goToRecord = function() {
        $scope.uploadState = 'record';
      }

      $scope.goToReview = function() {
        $scope.uploadState = 'review';
      }

      $scope.goToShare = function() {
        $scope.uploadState = 'share';
      }


      $scope.goToDash = function() {
        var videoId = $scope.recordingInfo.recordingId;
        $scope.resetUpload();
        if(videoId) {
          $state.go('tab.video-detail', {videoId: videoId});
        }
        else {
          $state.go('tab.dash');
        }
      }


      $scope.onRecordingStart = function(recordingId) {
        $scope.recordingInfo.state = 'live';
        videoSearchService.update($scope.recordingInfo);
        
        $timeout(function() {
          console.log("before thumbnail");
          $scope.takeThumbnail('before');
        }, 5000);

        $scope.thumbInterval = $interval(function() {
          console.log("after thumbnail");
          $scope.takeThumbnail('after');
        }, 2000);

      }

      $scope.onRecordingFinish = function(recordingId) {
        $scope.recordingInfo.state = 'finished';
        videoSearchService.update($scope.recordingInfo);
        if($scope.thumbInterval) {
          $interval.cancel($scope.thumbInterval);
          $scope.thumbInterval = undefined;
        }
        $scope.goToReview();
      }

      $scope.takeThumbnail = function(thumbnailType) {
        var screenshotSrc = $scope.recordControl.getScreenshot();
        $scope.recordingInfo.thumbnails[thumbnailType] = screenshotSrc;
        videoSearchService.update($scope.recordingInfo);
      }

      $scope.$on('$ionicView.beforeLeave', function(){
        if($scope.thumbInterval) {
          $interval.cancel($scope.thumbInterval);
          $scope.thumbInterval = undefined;
        }
        $scope.resetUpload();
      });

    })

  
})();

