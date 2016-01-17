(function () {
    angular
        .module('app')
        .controller('LoginController', LoginController);
    
    function LoginController(domain) {
        var vm = this;
        var authRoot = domain + '/.auth/login/';
        vm.microsoftLoginUrl = authRoot + "microsoftaccount";
        vm.googleLoginUrl = authRoot + "google";
        vm.facebookLoginUrl = authRoot + "facebook";
        vm.twitterLoginUrl = authRoot + "twitter";
    }
})()