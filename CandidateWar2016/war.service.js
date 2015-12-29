(function () {
    'use strict';

    angular.module('app')
        .factory('WarService', WarService);

    WarService.$inject = ['$http', '$q', 'serviceRoot'];
    function WarService($http, $q, serviceRoot) {

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
                var msg = 'Could not retrieve list of contestants.';
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
            .get(serviceRoot + 'CreateMatch')
            .then(itWorked)
            .catch(onFail);

            function onFail(err) {
                var msg = 'Could not retrieve new match.';
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
            .put(serviceRoot + 'Vote', { MatchId: matchId, Choice: choice })
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