(function () {
    angular
        .module('app')
        .controller('ScoresController', ScoresController);

    function ScoresController(WarService, $location) {
        var vm = this;

        vm.itemsPerPage = 10;
        vm.currentPage = 0;
        vm.contestants = [];
        vm.range = function () {
            var rangeSize = 4;
            var ps = [];
            var start;
            start = vm.currentPage;
            if (start > vm.pageCount() - rangeSize) {
                start = vm.pageCount() - rangeSize + 1;
            }

            for (var i = start; i < start + rangeSize; i++) {
                ps.push(i);
            }

            return ps;
        };

        vm.setPage = function (n) {
            WarService.getContestants(vm.itemsPerPage, vm.itemsPerPage * n).then(function (response) {
                vm.currentPage = n;
                vm.contestants = response.Content;
                vm.count = response.Count;
                vm.skip = response.Skip;
                vm.take = response.Take;
            })
            .catch(function (err) {
                vm.contestants = [];
                vm.count = 0;
                vm.skip = 0;
                vm.take = 0;
                vm.currentPage = 0;
            });
        };

        vm.setPage(0);

        vm.pageCount = function () {
            return Math.ceil(vm.count / vm.itemsPerPage) - 1;
        };

        vm.nextPage = function () {
            if (vm.currentPage < vm.pageCount()) {
                vm.setPage(vm.currentPage + 1);
            }
        };

        vm.prevPage = function () {
            if (vm.currentPage > 0) {
                vm.setPage(vm.currentPage - 1);
            }
        };

        vm.prevPageDisabled = function () {
            vm.currentPage <= 0 ? "disabled" : "";
        };

        vm.nextPageDisabled = function () {
            vm.currentPage >= vm.pageCount() ? "disabled" : "";
        };
    }
})()