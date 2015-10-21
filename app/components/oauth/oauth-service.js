var oauth2 = oauth2 || {};

(function (namespace) {

    function OAuthService($document, $timeout, $q, $location, $http, $log, $state, $rootScope, $base64) {

        var that = this;
        
        this.clientId = "";
        this.redirectUri = "";
        this.loginUrl = "";
        this.scope = "";
        this.rngUrl = "";
        this.oidc = false;

        this.createLoginUrl = function (state) {
            var that = this;

            if (typeof state === "undefined") { state = ""; }

            return this.createAndSaveNonce().then(function (nonce) {

                if (state) {
                    state = nonce + ";" + state;
                }
                else {
                    state = nonce;   
                }

                var response_type = "token";

                if (that.oidc) {
                    response_type = "id_token+token";
                }

                var url = that.loginUrl 
                            + "?response_type="
                            + response_type
                            + "&client_id=" 
                            + encodeURIComponent(that.clientId) 
                            + "&state=" 
                            + encodeURIComponent(state) 
                            + "&redirect_uri=" 
                            + encodeURIComponent(that.redirectUri) 
                            + "&scope=" 
                            + encodeURIComponent(that.scope);
                
                if (that.oidc) {
                    url += "&nonce=" + encodeURIComponent(nonce);
                }
                
                return url;
            });
        };

        this.initImplicitFlow = function (additionalState) {
            this.createLoginUrl(additionalState).then(function (url) {
                location.href = url;
            })
            .catch(function (error) {
                $log.error("Error in initImplicitFlow");
                $log.error(error);
            });
        };

        this.tryLogin = function (options) {
            
            options = options || { };
            
            var parts = this.getFragment();

            var accessToken = parts["access_token"];
            var idToken = parts["id_token"];
            var state = parts["state"];
            
            var oidcSuccess = false;
            var oauthSuccess = false;

            if (!accessToken || !state) return false;
            if (this.oidc && !idToken) return false;

            var savedNonce = localStorage.getItem("nonce");

            var stateParts = state.split(';');
            var nonceInState = stateParts[0];
            if (savedNonce === nonceInState) {
                
                localStorage.setItem("access_token", accessToken);

                var expiresIn = parts["expires_in"];

                if (expiresIn) {
                    var expiresInMilliSeconds = parseInt(expiresIn) * 1000;
                    var now = new Date();
                    var expiresAt = now.getTime() + expiresInMilliSeconds;
                    localStorage.setItem("expires_at", expiresAt);
                }
                if (stateParts.length > 1) {
                    this.state = stateParts[1];
                }

                oauthSuccess = true;

            }
            
            if (!oauthSuccess) return false;

            if (!this.oidc && options.onTokenReceived) {
                options.onTokenReceived({ accessToken: accessToken});
            }
            
            if (this.oidc) {
                oidcSuccess = this.processIdToken(idToken, accessToken);
                if (!oidcSuccess) return false;  
            }
            
            var callEventIfExists = function() {
                
                if (options.onTokenReceived) {
                    var tokenParams = { 
                        idClaims: that.getIdentityClaims(),
                        idToken: idToken,
                        accessToken: accessToken
                    };
                    options.onTokenReceived(tokenParams);
                }
            }
            
            if (options.validationHandler) {
                
                var validationParams = {accessToken: accessToken, idToken: idToken};
                
                options
                    .validationHandler(validationParams)
                    .then(function() {
                        callEventIfExists();
                    })
                    .catch(function(reason) {
                        $log.error('Error validating tokens');
                        $log.error(reason);
                    })
            }
            else {
                callEventIfExists();
            }
            
            var win = window;
            if (win.parent && win.parent.onOAuthCallback) {
                win.parent.onOAuthCallback(this.state);
            }            

            return true;
        };
        
        this.processIdToken = function(idToken, accessToken) {
                var tokenParts = idToken.split(".");
                var claimsBase64 = padBase64(tokenParts[1]);
                var claimsJson = $base64.decode(claimsBase64);
                var claims = JSON.parse(claimsJson);
                var savedNonce = localStorage.getItem("nonce");
                
                if (claims.aud !== this.clientId) {
                    $log.warn("Wrong audience: " + claims.aud);
                    return false;
                }

                if (this.issuer && claims.iss !== this.issuer) {
                    $log.warn("Wrong issuer: " + claims.issuer);
                    return false;
                }

                if (claims.nonce !== savedNonce) {
                    $log.warn("Wrong nonce: " + claims.nonce);
                    return false;
                }
                
                if (accessToken && !this.checkAtHash(accessToken, claims)) {
                    $log.warn("Wrong at_hash");
                    return false;
                }
                
                // Das Prüfen des Zertifikates wird der Serverseite überlassen!

                var now = Date.now();
                var issuedAtMSec = claims.iat * 1000;
                var expiresAtMSec = claims.exp * 1000;
                
                var tenMinutesInMsec = 1000 * 60 * 10;

                if (issuedAtMSec - tenMinutesInMsec >= now  || expiresAtMSec + tenMinutesInMsec <= now) {
                    $log.warn("Token has been expired");
                    $log.warn({
                       now: now,
                       issuedAtMSec: issuedAtMSec,
                       expiresAtMSec: expiresAtMSec
                    });
                    return false;
                }

                localStorage.setItem("id_token", idToken);
                localStorage.setItem("id_token_claims_obj", claimsJson);
                localStorage.setItem("id_token_expires_at", expiresAtMSec);
                
                if (this.validationHandler) {
                    this.validationHandler(idToken)
                }
                
                return true;
        }
        
        this.getIdentityClaims = function() {
            var claims = localStorage.getItem("id_token_claims_obj");
            if (!claims) return null;
            return JSON.parse(claims);
        }
        
        var padBase64 = function (base64data) {
            while (base64data.length % 4 !== 0) {
                base64data += "=";
            }
            return base64data;
        }

        this.tryLoginWithIFrame = function () {
            var that = this;
            var deferred = $q.defer();

            var url = this.createLoginUrl();

            var html = "<iframe src='" + url + "' height='400' width='400' id='oauthFrame' class='oauthFrame'></iframe>";
            var win = window;

            win.onOAuthCallback = function () {
                $timeout(function () {
                    $document.find("#oauthFrame").remove();
                }, 0);

                deferred.resolve();
            };

            $document.find("#oauthFrame").remove();

            var elem = $(html);
            $document.find("body").children().first().append(elem);

            return deferred.promise;
        };

        this.tryRefresh = function () {
            var that = this;
            var deferred = $q.defer();

            return this.createLoginUrl().then(function (url) {

                var html = "<iframe src='" + url + "' height='400' width='400' id='oauthFrame' class='oauthFrameHidden'></iframe>";

                var win = window;
                var callbackExecuted = false;
                var timeoutReached = false;

                // Wenn nach einer festgelegten Zeitspanne keine Antwort kommt: Timeout
                var timeoutPromise = $timeout(function () {
                    if (!callbackExecuted) {
                        timeoutReached = true;
                        var x = $document.find("iframe");

                        $document.find("#oauthFrame").remove();
                        deferred.reject();
                    }
                }, 10000);

                win.onOAuthCallback = function () {
                    if (timeoutReached)
                        return;

                    // Timer für Timeout abbrechen
                    $timeout.cancel(timeoutPromise);

                    // Der Aufrufer (= iframe) kann nicht im Zuge des Aufrufes entfernt werden
                    // Deswegen wird das Entfernen mit einer Verzögerung von 0 Sekunden gesheduled
                    // Das hat zur Folge, dass kurz *NACH* (weil nur ein Thread!) der Abarbeitung
                    // dieses Codes der Timeout eintritt
                    $timeout(function () {
                        $document.find("#oauthFrame").remove();
                    }, 0);

                    deferred.resolve();
                };

                $document.find("#oauthFrame").remove();

                //var elem = $(html);
                //var e2 = angular.element(html);
                var elem = angular.element(html);
                $document.find("body").append(elem);

                return deferred.promise;
            });
        };

        this.getAccessToken = function () {
            return localStorage.getItem("access_token");
        };

        this.getIsLoggedIn = function () {
            if (this.getAccessToken()) {

                var expiresAt = localStorage.getItem("expires_at");
                var now = new Date();
                if (expiresAt && parseInt(expiresAt) < now.getTime()) {
                    return false;
                }

                return true;
            }

            return false;
        };

        this.logOut = function () {
            localStorage.removeItem("access_token");
            localStorage.removeItem("id_token");
            localStorage.removeItem("nonce");
            localStorage.removeItem("expires_at");
            localStorage.removeItem("id_token_claims_obj");
            localStorage.removeItem("id_token_expires_at");
        };

        this.createAndSaveNonce = function () {
            // var state = this.createNonce();

            return this.createNonce().then(function (nonce) {
                localStorage.setItem("nonce", nonce);
                return nonce;
            })

        };

        this.createNonce = function () {
            
            if (this.rngUrl) {
                return $http
                        .get(this.rngUrl)
                        .then(function (result) {
                            return result.data;
                        });
            }
            else {
                var text = "";
                var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

                for (var i = 0; i < 40; i++)
                   text += possible.charAt(Math.floor(Math.random() * possible.length));

                return $q.when(text);
                
            }
        };

        this.getFragment = function () {
            if (window.location.hash.indexOf("#") === 0) {
                return this.parseQueryString(window.location.hash.substr(1));
            } else {
                return {};
            }
        };

        this.parseQueryString = function (queryString) {
            var data = {}, pairs, pair, separatorIndex, escapedKey, escapedValue, key, value;

            if (queryString === null) {
                return data;
            }

            pairs = queryString.split("&");

            for (var i = 0; i < pairs.length; i++) {
                pair = pairs[i];
                separatorIndex = pair.indexOf("=");

                if (separatorIndex === -1) {
                    escapedKey = pair;
                    escapedValue = null;
                } else {
                    escapedKey = pair.substr(0, separatorIndex);
                    escapedValue = pair.substr(separatorIndex + 1);
                }

                key = decodeURIComponent(escapedKey);
                value = decodeURIComponent(escapedValue);

                if (key.substr(0, 1) === '/')
                    key = key.substr(1);

                data[key] = value;
            }

            return data;
        };
        
        this.checkAtHash = function(accessToken, idClaims) {
            if (!accessToken || !idClaims || !idClaims.at_hash ) return true;
            
            var tokenHash = sha256(accessToken, { asString: true });
            
            var leftMostHalf = tokenHash.substr(0, tokenHash.length/2 );

            var tokenHashBase64 = $base64.encode(leftMostHalf);
            var atHash = tokenHashBase64.replace("+", "-").replace("/", "_").replace(/=/g, ""); 

            return (atHash == idClaims.at_hash);
        }

        
        this.setup = function (options) {
            
             options = options || {};
             options.loginState = options.loginState || "login"; 
         
             $rootScope.$on("$stateChangeStart", function (event, toState, toParams, fromState, fromParams) {
        
                if (toState.restricted && !that.getIsLoggedIn()) {
                    event.preventDefault();
                    var requestedUrl = $state.href(toState, toParams); 
                    
                    $state.transitionTo(options.loginState, { requestedUrl: requestedUrl });
                }

            });

            if (this.tryLogin(options)) {
                
        
                if (this.state) {  
                    $location.url(this.state.substr(1)); // cut # off
                }
            }
            
        }
        
    }
    

    namespace.OAuthService = OAuthService;

    var isAngularApp = (window.angular != undefined);

    if (isAngularApp) {
        var app = angular.module("oauth2");
        app.service("oauthService", OAuthService);
    }
})(oauth2);