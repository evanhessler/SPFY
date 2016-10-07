var Hapi = require('hapi');
var Path = require('path');
var Inert = require('inert');
var Bcrypt = require('bcrypt');
var BasicAuth = require('hapi-auth-basic');
var Vision = require('vision');
var PostgreSQL = require('pg');
var url = require('url');

var setup = {
    host: process.env.NODE_ENV === "production" ? "0.0.0.0" : "localhost",
    port: process.env.PORT || "8080"
};
var Api = require(Path.join(__dirname, 'routes/api_routes.js'));
var viewRoutes = require(Path.join(__dirname, 'routes/view_routes.js'));
var loginRoutes = require(Path.join(__dirname, 'routes/login_routes.js'));

var postgresqlPool = {
    register: function (server, options, next) {
        var params = url.parse(process.env.DATABASE_URL);
        var auth = params.auth.split(':');

        var dbconfig = {
            user: auth[0],
            password: auth[1],
            host: params.hostname,
            port: params.port,
            database: params.pathname.split('/')[1],
            ssl: true,
            max: 20,
            min: 4
        };

        var pool = new PostgreSQL.Pool(dbconfig);

        server.decorate('server', 'postgres', pool);
        server.decorate('request', 'postgres', pool);

        pool.on('error', function (err, client) {
            if ("" + err) {
                server.log(['warning', 'PostgreSQL'], "" + err);
                server.log(['warning', 'PostgreSQL'], client);
            }
        });

        next();
    }
};
postgresqlPool.register.attributes = {
    name: "PostgreSQL",
    version: "0.0.0"
};

var users = {
    SPFY: {
        id: '1',
        username: 'SPFYstaff',
        password: '$2a$04$YPy8WdAtWswed8b9MfKixebJkVUhEZxQCrExQaxzhcdR2xMmpSJiG'
    }
};

var SPFY = new Hapi.Server({
    connections: {
        routes: {
            files: {
                relativeTo: Path.join(__dirname, 'static')
            }
        }
    }
});
SPFY.connection({
    host: setup.host,
    port: setup.port
});

SPFY.register(BasicAuth, function(err){
    if (err) {
        throw err;
    }

    var basicValidation = function (request, username, password, callback) {
        var user = users[ username ];

        if (!user) {
            return callback(null, false);
        }

        Bcrypt.compare(password, user.password, function (err, isValid) {
            callback(err, isValid, {id: user.id, name: user.name});
        });
    };

    SPFY.auth.strategy('basic','basic', { validateFunc: basicValidation });

    SPFY.route(loginRoutes);
});

SPFY.register(postgresqlPool, function () {});
SPFY.register(Api, {
    routes: {
        prefix: '/api'
    }
});

SPFY.register(Inert, function () {});
SPFY.register(Vision, function () {
    SPFY.views({
        engines: {
            html: require('nunjucks-hapi')
        },
        path: Path.join(__dirname, 'templates')
    });
    SPFY.route(viewRoutes);
});

SPFY.register({
    register: require('good'),
    options: {
        ops: {
            interval: 1000
        },
        reporters: {
            console: [{
                module: 'good-squeeze',
                name: 'Squeeze',
                args: [{
                    log: '*',
                    response: '*'
                }]
            }, {
                module: 'good-console'
            }, 'stdout']
        }
    }
}, function (err) {
    if (err) {
        SPFY.log(['error', 'good'], err);
    }
});

SPFY.start(function () {
    SPFY.log(['info', 'SPFY'], "Server started on " + setup.host + ":" + setup.port);
    SPFY.log(['info', 'SPFY'], process.env.DATABASE_URL);
});

module.exports = SPFY;
