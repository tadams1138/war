(function () {
    // register the controller with the module
    angular
        .module('app')
        .controller('ScoresController', ScoresController);

    function ScoresController(WarService, logoutUrl) {
        var vm = this;
        vm.logoutUrl = logoutUrl;

        activate();

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