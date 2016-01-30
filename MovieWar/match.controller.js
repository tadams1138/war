(function () {
    angular
        .module('app')
        .controller('MatchController', MatchController);

    function MatchController(WarService, $location) {
        var vm = this;
        vm.showMatch = true;

        getUserInfo();
        refreshMatch();

        function getUserInfo() {
            WarService.getUserInfo().then(function (userInfo) {
                vm.userInfo = userInfo;
            })
            .catch(function (err) {
                $location.url('/login');
            });
        }

        function refreshMatch() {
            WarService.getMatch().then(function (match) {
                vm.match = match;
                vm.showMatch = true;
            })
            .catch(function (err) {
                vm.match = null;
            });
        }

        vm.voteContestant1 = function () {
            vm.showMatch = false;
            WarService.vote(vm.match.Id, 1).then(refreshMatch());
        }
        vm.voteContestant2 = function () {
            vm.showMatch = false;
            WarService.vote(vm.match.Id, 2).then(refreshMatch());
        }
        vm.votePass = function () {
            vm.showMatch = false;
            WarService.vote(vm.match.Id, 3).then(refreshMatch());
        }
    }
})()