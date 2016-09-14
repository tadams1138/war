(function () {
    'use strict';

    angular
        .module('app')
        .factory('WarService', WarService);

    WarService.$inject = ['$http', '$q', 'serviceRoot', 'domain'];
    function WarService($http, $q, serviceRoot, domain) {

        var service = {
            getContestants: getContestants,
            getMatch: getMatch,
            vote: vote,
            getUserInfo: getUserInfo
        };

        return service;

        function getContestants(take, skip) {
            var postData = { OrderByScoreDesc : true,
                Skip : skip,
                Take : take
            };

            return $http({
                url: serviceRoot + 'Contestants/Search',
                method: "PUT",
                data: postData,
                headers: { 'Content-Type': 'application/json' }
            })
            .then(itWorked)
            .catch(onFail);

            function onFail(err) {
                var msg = 'Could not retrieve list of contestants.';
                console.log(msg);
                return $q.reject(msg);
            }

            function itWorked(response) {
                var paginatedContestants = response.data;
                return paginatedContestants;
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

        function getUserInfo()
        {
            return $http
            .get(domain + 'api/User')
            .then(itWorked)
            .catch(onFail);

            function onFail(err) {
                var msg = 'Could not get user info.';
                console.log(msg);
                return $q.reject(msg);
            }

            function itWorked(response) {
                var user = response.data;
                return user;
            }
        }
    }
})();