(function () {
    // register the controller with the module
    angular
        .module('app')
        .controller('MatchController', MatchController);

    function MatchController(WarService) {
        var vm = this;

        refreshMatch();

        function refreshMatch() {
            WarService.getMatch().then(function (match) {
                vm.match = match;
            })
            .catch(function (err) {
                vm.match = null;
            });
        }

        vm.voteContestant1 = function () {
            WarService.vote(vm.match.Id, 1).then(refreshMatch());
        }
        vm.voteContestant2 = function () {
            WarService.vote(vm.match.Id, 2).then(refreshMatch());
        }
        vm.votePass = function () {
            WarService.vote(vm.match.Id, 3).then(refreshMatch());
        }
    }
})()