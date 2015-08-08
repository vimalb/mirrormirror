document.APP_MODULES = document.APP_MODULES || [];

(function(){

var SERVICE_URL = document.currentScript.src;
var SERVICE_PATH = URI(SERVICE_URL).path();
SERVICE_PATH = SERVICE_PATH.substring(SERVICE_PATH.indexOf('/src/services/'));

var MODULE_NAME = 'mainApp'+SERVICE_PATH.replace('/src','').replace('/service.js','').replace(/\//g,'.');
var SERVICE_NAME = SERVICE_PATH.replace('/src/services/','').replace('/service.js','').replace(/\//g,'');

document.APP_MODULES.push(MODULE_NAME);

console.log(MODULE_NAME, "Registering service", SERVICE_NAME);
angular.module(MODULE_NAME, [])
    .factory(SERVICE_NAME, function($q, CLIENT_SETTINGS, $http) {
      console.log("Instantiating service", SERVICE_NAME);

      return {
        search: function(searchRequest) {
          console.log("Searching", searchRequest);
          var deferred = $q.defer();
          var url = CLIENT_SETTINGS.SERVER_URL + '/api/recordings';
          $http.get(url).then(function(resp) {
            var videos = _.filter(resp.data, function(video) {
              if(searchRequest.live) {
                return _.includes(['live'], video.state);
              }
              else {
                return _.includes(['live', 'finished'], video.state);
              }
            });
            deferred.resolve(videos);
          });
          return deferred.promise;
        },
        get: function(videoId) {
          var deferred = $q.defer();
          var url = CLIENT_SETTINGS.SERVER_URL + '/api/recordings/' + videoId;
          $http.get(url).then(function(resp) {
            deferred.resolve(resp.data);
          });
          return deferred.promise;
        },
        update: function(videoInfo) {
          if(videoInfo.recordingId) {
            var deferred = $q.defer();
            var url = CLIENT_SETTINGS.SERVER_URL + '/api/recordings/' + videoInfo.recordingId;
            $http.post(url, JSON.stringify(videoInfo)).then(function(resp) {
              console.log("Updated recording", resp.data);
              deferred.resolve(resp.data);
            });
            return deferred.promise;
          }
        }
      };

    });
  
  
})();