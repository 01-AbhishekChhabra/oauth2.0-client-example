var express = require('express'),
    app = express(),
    bodyParser = require('body-parser'),
    cookieParser = require('cookie-parser'),
    csrf = require('csurf');

var querystring = require('querystring');
var request = require('superagent');

var port = process.env.PORT || 3000;
var defaultScope = 'Analytics:MetronAPI:CreateGetDeleteAggregators,NoSQL core:*:*';

var authCodeEndpoint = process.env.AUTH_SITE + process.env.AUTHORIZATION_PATH;
var tokenEndpoint = process.env.AUTH_SITE + process.env.TOKEN_PATH;
var getRedirectUri = function(req) { return req.protocol + "://" + req.headers.host + "/callback"; };

var cookieName = "application-data-api-demo",
    cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
};

app.set('view engine', 'ejs');
app.enable('trust proxy');
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(csrf({ cookie: true }));

app.get('/', function(req, res) {
    var locals = {
        csrfToken: req.csrfToken(),
        scope: defaultScope
    };

    res.render('index', locals);
});

app.post('/auth', function(req, res) {
    // Authorization Request: https://tools.ietf.org/html/rfc6749#section-4.1.1
    var authCodeParams = querystring.stringify({
        response_type: "code",
        redirect_uri: getRedirectUri(req),
        client_id: process.env.CLIENT_ID,
        scope: req.body.scope,
        // Generate a secure state in production to prevent CSRF (https://tools.ietf.org/html/rfc6749#section-10.12)
        state: "f4c269a0-4a69-43c1-9405-86209c896fa0"
    });

    res.redirect(authCodeEndpoint + "?" + authCodeParams);
});

app.get('/callback', function(req, res) {
    // Authorization Response: https://tools.ietf.org/html/rfc6749#section-4.1.2
    // Validate req.query.state before continuing in production to prevent CSRF (https://tools.ietf.org/html/rfc6749#section-10.12)
    var authorizationCode = req.query.code;

    // Access Token Request: https://tools.ietf.org/html/rfc6749#section-4.1.3
    var payload = {
        grant_type: "authorization_code",
        redirect_uri: getRedirectUri(req),
        code: authorizationCode
    };

    request
        .post(tokenEndpoint)
        .auth(process.env.CLIENT_ID, process.env.CLIENT_SECRET)
        .type('form')
        .send(payload)
        .end(function(err, postResponse) {
            if (err) {
                console.log('Access Token Error', error.message);
                res.redirect('/');
            } else {
                // Access Token Response: https://tools.ietf.org/html/rfc6749#section-4.1.4
                // We are storing the access token in a cookie for simplicity, but the user agent should never have to see it
                res.cookie(cookieName, { accessToken: postResponse.body.access_token }, cookieOptions);

                // Optionally, store the refresh token (postResponse.body.refresh_token) to a user context (https://tools.ietf.org/html/rfc6749#section-6)

                res.redirect('/data');
            }
        });
});

app.get('/data', function(req, res) {
    var access_token = req.cookies[cookieName].accessToken;

    request
        .get(process.env.COURSE_ACCESS_ROUTE)
        .set('Authorization', `Bearer ${access_token}`)
        .end(function(courseAccessError, courseAccessResponse) {
            if (courseAccessError) {
                var error = JSON.stringify(courseAccessError, null, 2);
                console.log(error);
                res.send(`<pre>${error}</pre>`);
            } else {
                  request
                    .get(process.env.COURSE_INFO_ROUTE)
                    .set('Authorization', `Bearer ${access_token}`)
                    .end(function(courseInfoError, courseInfoResponse) {
                        if (courseInfoError) {
                            var error = JSON.stringify(courseInfoError, null, 2);
                            console.log(error);
                            res.send(`<pre>${error}</pre>`);
                        } else {
                            var locals = {
                                info: JSON.stringify(JSON.parse(courseInfoResponse.text || '{}'), null, 2),
                                data: JSON.stringify(JSON.parse(courseAccessResponse.text || '{}'), null, 2)
                            };
                            res.render('data', locals);
                        }
                    });
            }
        });
});

app.listen(port);
console.log(`HTTP started on port ${port}.`);

module.exports = app;
