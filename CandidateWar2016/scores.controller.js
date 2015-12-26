(function () {
    // register the controller with the module
    angular
        .module('app')
        .controller('ScoresController', ScoresController);

    function ScoresController(WarService) {
        var vm = this;

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