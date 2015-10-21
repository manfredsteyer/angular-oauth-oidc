# AngularJS with OAuth2 and OpenId Connect Implicit Flow Sample

## Dependencies
- angular-base64
- sha256

## IdentityServer
- Uses a hosted version of IdentityServer3 (https://github.com/IdentityServer/IdentityServer3)
- Login with any Facebook-Account or with max/geheim

## Components

You'll find the reusable oauthService within the folder ``components/oauth``.

## Configuration

Just configure ``oauthService`` and call setup to let it hook into UI-Router. Users that require to log in are redirected to the mentioned ``loginState`` and after logging in and receiving a token, ``onTokenReceived`` is called. There you can grab the requested token.

```
app.constant("config", { 
    apiUrl: "https://steyer-api.azurewebsites.net",
    loginUrl: "https://steyer-identity-server.azurewebsites.net/identity/connect/authorize",
    issuerUri: "https://steyer-identity-server.azurewebsites.net/identity"
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
```

UI-Router-Route that needs a logged-in user can be marked with ``restricted: true``. This is just about user experience and not about security. Security is done by validating the token at server-side.

```
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
```

## More Configuration-Options

You can also register the URL of an web-api that creates a random string when called via GET. This is to create a nonce-using preventing some attacks. Otherwise it uses some simple java-script-fallback for this. In addition to this, you could use the ``validationHandler``-callback to validate the received tokens. The next sample uses this to send the token to a service that checks the signature of it. The validationHandler should retour a promise that informs about the validity of the token by it's state.  

```
app.run(function (oauthService, $http, userService, config) {

    oauthService.loginUrl =  config.loginUrl;
    oauthService.redirectUri = location.origin + "/index.html";
    oauthService.clientId = "spa-demo";
    oauthService.scope = "openid profile email voucher";
    oauthService.issuer = config.issuerUri;
    oauthService.oidc = true;
    oauthService.rngUrl = config.rngUrl;
    
    oauthService.setup({
        loginState: 'login',
        onTokenReceived: function(context) {
            $http.defaults.headers.common['Authorization'] = 'Bearer ' + context.accessToken;
            userService.userName = context.idClaims['given_name'];
        },
        validationHandler: function(context) {
            var params = {token: context.idToken, client_id: oauthService.clientId};
            return $http.get(config.validationUrl, { params: params});
        }
    });

});
```

## Redirect User

To create the redirect-url that points the user to the Authorization-Server, just call ``createLoginUrl``. You can pass an ``optionState`` that denotes the UI-Router state the user should be redirected to after logging in.

```
oauthService.createLoginUrl(optinalState).then(function (url) {
   // do stuff with url
});
```

To directly redirect the user to the Authorization-Server, you can call ``initImplicitFlow``:

```
oauthService.initImplicitFlow(optionalState);
```

There is also an ``oauthLoginButton``-Directive you could use to create a login-button, that redirects the user to the Authorization-Server:

```
<input 
  oauth-login-button
  type="button" 
  value="Login" 
  state="model.requestedUrl" 
  class="btn" />
```  
