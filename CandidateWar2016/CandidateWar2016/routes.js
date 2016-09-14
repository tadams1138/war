(function () {
    'use strict';
    
    angular.module('app')
        .config(configureRoutes);

    configureRoutes.$inject = ['$locationProvider', '$routeProvider'];
    function configureRoutes($locationProvider, $routeProvider) {
        
        $locationProvider.html5Mode(true);

        $routeProvider.when('/', {
            controller: 'MatchController',
            templateUrl: 'match.html',
            controllerAs: 'vm'
        })
        .when('/scores', {
            controller: 'ScoresController',
            templateUrl: 'scores.html',
            controllerAs: 'vm'
        })
        .when('/login', {
            controller: 'LoginController',
            templateUrl: 'login.html',
            controllerAs: 'vm'
        })
        .otherwise({ redirectTo: '/' });
    }
})()