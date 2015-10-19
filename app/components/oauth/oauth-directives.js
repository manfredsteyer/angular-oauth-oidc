(function () {

    var oauth2 = angular.module("oauth2");

    oauth2.directive("oauthLoginButton", function (oauthService, $log) {
        return {
            scope: {
                state: "="
            },
            link: function (scope, element, attrs) {
                oauthService.createLoginUrl(scope.state).then(function (url) {
                    element.attr("onclick", "location.href='" + url + "'");
                })
                .catch(function (error) {
                    $log.error("oauthLoginButton-directive error");
                    $log.error(error);
                    throw error;
                });
            }
        };
    });

    oauth2.directive("oauthLoginForm", function (oauthService, $location, $timeout) {
        return {
            scope: {
                callback: "&",
                state: "="
            },
            link: function (scope, element, attrs) {

                window.onOAuthCallback = function (requestedUrl) {
                    if (scope.callback) {
                        scope.callback();
                    }

                    if (requestedUrl) {
                        $timeout(function () {
                            $location.url(requestedUrl.substr(1));
                        }, 0);
                    }
                }

                oauthService.createLoginUrl(scope.state).then(function (url) {
                    var html = "<iframe src='" + url + "' height='400' width='400' id='oauthFrame' class='oauthFrame'></iframe>";
                    element.html(html);
                }).catch(function (error) {
                    $log.error("oauthLoginForm-directive error");
                    $log.error(error);
                });
            }
        };
    });

})();