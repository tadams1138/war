(function () {
    'use strict';

    angular.module('app')
    .factory('WarService', WarService);

    WarService.$inject = ['$http', '$q'];
    function WarService($http, $q) {
        //const serviceRoot = 'http://tandisoftwarapi.azurewebsites.net/api/War/2/';
        const serviceRoot = 'http://localhost:6903/api/War/2/';

        var service = {
            getContestants: getContestants,
            getMatch: getMatch,
            vote: vote
        };

        return service;
        
        function getContestants() {
            return $http
            .get(serviceRoot + 'Contestants')
            .then(itWorked)
            .catch(onFail);

            function onFail(err) {
                var msg = 'Could not retieve list of contestants.';
                console.log(msg);
                return $q.reject(msg);
            }

            function itWorked(response) {
                var contestants = response.data;
                return contestants;
            }
        }

        function getMatch() {
            return $http
            .post(serviceRoot + 'CreateMatch')
            .then(itWorked)
            .catch(onFail);

            function onFail(err) {
                var msg = 'Could not retieve new match.';
                console.log(msg);
                return $q.reject(msg);
            }

            function itWorked(response) {
                var match = response.data;
                return match;
            }
        }

        function vote(matchId, choice) {
            return $http
            .post(serviceRoot + 'Vote', { MatchId: matchId, Choice: choice })
            .then(itWorked)
            .catch(onFail);

            function onFail(err) {
                var msg = 'Could not submit the vote.';
                console.log(msg);
                return $q.reject(msg);
            }

            function itWorked(response) {
                var contestants = response.data;
                return contestants;
            }
        }
    }
})();