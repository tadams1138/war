(function () {
    'use strict';

    angular
        .module('app')
        .config(configureRoutes);

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
        .otherwise({ redirectTo: '/' });
    }
})()