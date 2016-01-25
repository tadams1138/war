(function () {
    angular
        .module('app')
        .controller('ScoresController', ScoresController);

    function ScoresController(WarService, $location) {
        var vm = this;

        getUserInfo();
        activate();

        function getUserInfo() {
            WarService.getUserInfo().then(function (userInfo) {
                vm.userInfo = userInfo;
            })
            .catch(function (err) {
                $location.url('/login');
            });
        }

        function activate() {
            WarService.getContestants().then(function (contestants) {
                vm.contestants = contestants;
            })
            .catch(function (err) {
                vm.contestants = [];
            });
        }        
    }
})()