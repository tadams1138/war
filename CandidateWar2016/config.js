(function () {
    //angular.module('app').value('serviceRoot' , 'https://tandisoftwarapi.azurewebsites.net/api/War/2/');
    angular.module('app').value('serviceRoot', 'https://tandisoftwarapitest.azurewebsites.net/api/War/2/');
    //angular.module('app').constant('serviceRoot', 'http://localhost:6903/api/War/2/')

    angular.module('app')
        .config(['$httpProvider', function ($httpProvider) {
            //$httpProvider.defaults.useXDomain = true;
            //delete $httpProvider.defaults.headers.common['X-Requested-With'];
            //delete $httpProvider.defaults.headers.common['User-Agent'];
            $httpProvider.defaults.withCredentials = true;
        }])
    //angular.module('myApp', ['ngCookies'])
    //    .run(['$http', '$cookies', function ($http, $cookies) {
    //        $http.defaults.headers.post['X-CSRFToken'] = $cookies.csrftoken;
    //    }]);
})()

