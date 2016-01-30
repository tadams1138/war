(function () {
    angular
        .module('app')
        .controller('LoginController', LoginController);
    
    function LoginController(domain, $location) {
        var vm = this;
        var authRoot = domain + '.auth/login/';
        vm.microsoftLoginUrl = BuildUrl(domain, $location, "microsoftaccount");
        vm.googleLoginUrl = BuildUrl(domain, $location, "google");
        vm.facebookLoginUrl = BuildUrl(domain, $location, "facebook");
        vm.twitterLoginUrl = BuildUrl(domain, $location, "twitter");
    }

    function BuildUrl(domain, $location, provider) {
        var result = domain +
            '.auth/login/' +
            provider +
            "?post_login_redirect_url=/api/Redirect?uri=" +
            $location.protocol() +
            "://" +
            $location.host();
        return result;
    }
})()