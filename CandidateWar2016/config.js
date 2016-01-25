(function () {
    //var domain = 'https://tandisoftwarapi.azurewebsites.net/';
    var domain = 'https://tandisoftwarapitest.azurewebsites.net/';
    //var domain = 'http://localhost:6903/';

    var serviceRoot = domain + 'api/War/2/';

    angular.module('app')
        .config(configure)
        .value('serviceRoot', serviceRoot)
        .value('domain', domain)

    configure.$inject = ['$httpProvider'];
    function configure($httpProvider) {
        $httpProvider.defaults.withCredentials = true;
    }
})()

