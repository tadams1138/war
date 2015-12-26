(function () {
    // register the controller with the module
    angular
        .module('app')
        .controller('MatchController', MatchController);

    function MatchController(WarService) {
        var vm = this;
        vm.showMatch = true;

        refreshMatch();

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