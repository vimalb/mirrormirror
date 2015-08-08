document.APP_MODULES = document.APP_MODULES || [];

(function(){

var CONTROLLER_URL = document.currentScript.src;
var TEMPLATE_URL = CONTROLLER_URL.replace('controller.js','view.html');
var CONTROLLER_PATH = URI(CONTROLLER_URL).path();
CONTROLLER_PATH = CONTROLLER_PATH.substring(CONTROLLER_PATH.indexOf('/src/controllers/'));

var ROUTE_URL = '/live/:videoId';
var MODULE_NAME = 'mainApp'+CONTROLLER_PATH.replace('/src','').replace('/controller.js','').replace(/\//g,'.');
var CONTROLLER_NAME = MODULE_NAME.replace(/\./g,'_').replace(/-/g,'_');
document.APP_MODULES.push(MODULE_NAME);

console.log(MODULE_NAME, "Registering route", ROUTE_URL);
angular.module(MODULE_NAME, ['ionic'])
  .config(function($stateProvider) {
    $stateProvider.state('tab.live-detail', {
      url: ROUTE_URL,
      views: {
        'tab-dash': {
          templateUrl: TEMPLATE_URL,
          controller: CONTROLLER_NAME
        }
      }
    });
  })
  .controller(CONTROLLER_NAME, function($scope, $stateParams, videoSearchService, $sce, $timeout, $interval, userService) {
      $scope.video = {};
      $scope.videoComments = [];
      $scope.newComment = {'user': userService.getCurrentUser(), 'text': ''};

      $scope.liveVideo = {
        playingState: false,
        startPlay: undefined,
        stopPlay: undefined,
      }

      $scope.loadComments = function(video) {
        videoSearchService.getComments($scope.video.recordingId).then(function(comments) {
          console.log("comments", comments);
          $scope.videoComments = comments;
        });
      }

      $scope.submitComment = function() {
        console.log("submit comment", $scope.newComment);
        if($scope.newComment.text) {
          videoSearchService.submitComment($scope.video.recordingId, $scope.newComment).then(function(comments) {
            $scope.newComment.text = '';
            $scope.videoComments = comments;
          });
        }
      }

      $scope.$on('$ionicView.beforeEnter', function(){
        videoSearchService.get($stateParams.videoId).then(function(video) {
          $scope.video = video;
          $scope.loadComments(video);
          $scope.pollInterval = $interval(function() {
            $scope.loadComments(video);
            if($scope.liveVideo.startPlay && !$scope.liveVideo.playingState) {
              $scope.liveVideo.startPlay();
            }
          }, 1000);
        });
      });

      $scope.$on('$ionicView.beforeLeave', function(){
        if($scope.liveVideo.stopPlay) {
          $scope.liveVideo.stopPlay();
        }
        if($scope.pollInterval) {
          $interval.cancel($scope.pollInterval);
          $scope.pollInterval = undefined;
        }
        $scope.video = {};
      });




  })

  
})();

