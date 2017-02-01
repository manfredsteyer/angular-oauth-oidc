var app = angular.module("demo", ["oauth2", "ui.router"]);

app.config(function ($stateProvider, $urlRouterProvider, $locationProvider) {
    $locationProvider.html5Mode(false);

    $urlRouterProvider.otherwise('/home');

    $stateProvider.state('home', {
        url: '/home',
        templateUrl: '/app/demo/home.html',
    }).state('voucher', {
        url: '/voucher',
        templateUrl: '/app/demo/voucher.html',
        controller: 'VoucherCtrl',
        restricted: true
    }).state('login', {
        url: '/login?requestedUrl',
        templateUrl: '/app/demo/login.html',
        controller: 'LoginCtrl'
    }).state('logout', {
        url: '/logout',
        templateUrl: '/app/demo/logout.html',
        controller: 'LogoutCtrl'
    });

});

app.service('userService', function() { userName: null });

/*
// Local-Scenario
app.constant("config", { 
    apiUrl: "http://localhost:63669",
    rngUrl: "http://localhost:63669/api/rng",
    loginUrl: "https://localhost:44301/identity/connect/authorize",
    issuerUri: "https://localhost:44301/identity",
    validationUrl: "https://localhost:44301/identity/connect/identitytokenvalidation"
});
*/

// Online-Scenario
app.constant("config", { 
    apiUrl: "https://steyer-api.azurewebsites.net",
    loginUrl: "https://steyer-identity-server.azurewebsites.net/identity/connect/authorize",
    issuerUri: "https://steyer-identity-server.azurewebsites.net/identity",
    validationUrl: "https://steyer-identity-server.azurewebsites.net/identity/connect/identitytokenvalidation"
});

app.run(function (oauthService, $http, userService, config) {

    oauthService.loginUrl =  config.loginUrl;
    oauthService.redirectUri = location.origin + "/index.html";
    oauthService.clientId = "spa-demo";
    oauthService.scope = "openid profile email voucher";
    oauthService.issuer = config.issuerUri;
    oauthService.oidc = true;
    
    oauthService.setup({
        loginState: 'login',
        onTokenReceived: function(context) {
            $http.defaults.headers.common['Authorization'] = 'Bearer ' + context.accessToken;
            userService.userName = context.idClaims['given_name'];
        }
    });

});

app.run(function ($rootScope, userService) {
    $rootScope.userService = userService;
});

app.controller("VoucherCtrl", function ($scope, $http, oauthService, config) {

    $scope.model = {};

    $scope.model.message = "";
    $scope.model.buyVoucher = function () {
        $http
            .post(config.apiUrl + "/api/voucher?amount=150", null)
            .then(function (result) {
                $scope.model.message = result.data;
        })
        .catch(function (message) {
                $scope.model.message = "Was not able to receive new voucher: " + message.status;
        });
    }

    $scope.refresh = function () {
        oauthService
            .tryRefresh()
            .then(function () {
                $scope.model.message = "Got Token!";
                $http.defaults.headers.common['Authorization'] = 'Bearer ' + oauthService.getAccessToken();
            })
            .catch(function () {
                $scope.model.message = "Error receiving new token!";
            });
    }

});


app.factory('sampleHttpInjector', function($q) {

      return {
        'request': function(config) {
          return config;
        },
       'requestError': function(rejection) {
          return $q.reject(rejection);
        },
        'response': function(response) {
          return response;
        },
       'responseError': function(rejection) {
            return $q.reject(rejection);
        }
      };
    });


app.config(function($httpProvider) {  

    $httpProvider.interceptors.push('sampleHttpInjector');

});


app.controller("LoginCtrl", function ($scope, $stateParams, oauthService, $http) {

    $scope.model = {
        requestedUrl: $stateParams.requestedUrl,
        callback: function(requestedUrl) {
            $http.defaults.headers.common['Authorization'] = 'Bearer ' + oauthService.getAccessToken();
        }
    };

});

app.controller("LogoutCtrl", function (oauthService) {
    oauthService.logOut();
})
