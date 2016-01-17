(function () {
    //var domain = 'https://tandisoftwarapi.azurewebsites.net';
    var domain = 'https://tandisoftwarapitest.azurewebsites.net';
    //var domain = 'http://localhost:6903/api/War/2/';

    var serviceRoot = domain + '/api/War/2/';
    var logoutUrl = domain + '/.auth/logout?post_logout_redirect_uri=http://google.com';

    angular.module('app')
        .config(configure)
        .value('serviceRoot', serviceRoot)
        .value('domain', domain)
        .value('logoutUrl', logoutUrl);

    configure.$inject = ['$httpProvider'];
    function configure($httpProvider) {
        $httpProvider.defaults.withCredentials = true;
        $httpProvider.interceptors.push('httpInterceptor');
    }
})()

