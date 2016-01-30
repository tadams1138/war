(function () {
    angular
        .module('app')
        .controller('ScoresController', ScoresController);

    function ScoresController(WarService, $location) {
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