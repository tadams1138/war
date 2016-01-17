(function () {
    'use strict';

    angular
        .module('app')
        .factory('httpInterceptor', httpInterceptor)

    httpInterceptor.$inject = ['$q', '$window', '$location'];
    function httpInterceptor($q, $window, $location) {
        var responseInterceptor = {

            responseError : function (response) {
                if (response.status === 401) {
                    $location.url('/login');
                }

                return $q.reject(response);;
            }
        };

        return responseInterceptor;
    }
})()