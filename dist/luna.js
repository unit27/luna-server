/*******************************************************************************
 * Name: Luna communication server. Support WebSocket (RFC 6455) / HTTP request
 * Version: 2.0.0
 * Author: Przemyslaw Ankowski (przemyslaw.ankowski@gmail.com)
 ******************************************************************************/


// Require important stuff
const EventEmitter = require("events").EventEmitter;


/**
 * Luna communication server constructor
 */
const Luna = function() {
    // Alias for this
    let self = this;

    // Http server
    let HttpServer = null;

    // Web socket server
    let WebSocketServer = null;

    // HTTP router
    let HttpRouter = null;

    // Definition of http server routing
    let HttpRouting = {};

    // Private flag for initialization
    let isInitialized = false;

    // Is JSON request (user want JSON response)?
    let isJson = false;

    // Luna communication server version
    let version = "2.0.2";


    /**
     * Luna communication server - events
     */
    let Events = {
        /**
         * Emit event when got server error
         *
         * @param message
         */
        onServerError: function(message) {
            // Emit event + message as parameter
            self.emit("server-error", message);
        },

        /**
         * Emit event when got socket error
         *
         * @param message
         */
        onSocketError: function(message) {
            // Emit event + message as parameter
            self.emit("socket-error", this, message);
        },

        /**
         * Emit when client visit default page
         */
        onVisitDefaultPage: function() {
            // Emit event + http request and http response as parameter
            self.emit("visit-default-page", this.req, this.res);
        },

        /**
         * Emit when client connect via web socket
         *
         * @param Socket
         * @param Request
         */
        onClientConnect: function(Socket, Request) {
            /**
             * Backward compatibility (for node WebSocket)
             */
            Socket.upgradeReq = Request;

            /**
             * Add socket connection state
             */
            Socket.__isConnected = true;

            /**
             * Add function to socket for set/get connection state
             *
             * @param state
             *
             * @returns {boolean|*}
             */
            Socket.isConnected = function(state = null) {
                if (state === null) {
                    return this.__isConnected;
                }

                this.__isConnected = state;
                return this.__isConnected;
            };

            /**
             * Send message (text) via opened web socket
             *
             * @param message
             * @param afterJob
             *
             * @returns {boolean}
             */
            Socket.sendMessage = function(message, afterJob) {
                // Socket is not connected
                if (!Socket.isConnected()) {
                    return false;
                }

                // Send message
                try {
                    this.send(message, {}, afterJob);
                }

                // Something goes wrong
                catch (exception) {
                    return false;
                }

                // Exit
                return true;
            };

            /**
             * Send message (binary) via opened web socket
             *
             * @param data
             * @param afterJob
             *
             * @returns {boolean}
             */
            Socket.sendData = function(data, afterJob) {
                // Socket is not connected
                if (!Socket.isConnected()) {
                    return false;
                }

                // Send message
                try {
                    this.send(data, {binary: true}, afterJob);
                }

                // Something goes wrong
                catch (exception) {
                    return false;
                }

                // Exit
                return true;
            };

            // Handle 'message' event on socket
            Socket.on("message", Events.onReceiveData);

            // Handle 'close' event on socket
            Socket.on("close", Events.onClientDisconnect);

            // Handle 'error' event on socket
            Socket.on("error", Events.onSocketError);

            // Emit event + socket as parameter
            self.emit("client-connect", Socket);
        },

        /**
         * Emit when client disconnect via web socket
         */
        onClientDisconnect: function() {
            // Emit event + socket as parameter
            self.emit("client-disconnect", this);

            // Change socket state
            this.isConnected(false);
        },

        /**
         * Emit when receive some data from web socket client
         *
         * @param data
         */
        onReceiveData: function(data) {
            // Emit event + socket and data as parameter
            self.emit("receive-data", this, data);
        }
    };

    /**
     * Luna communication server - listeners
     */
    let Listeners = {
        /**
         * Listen on HTTP requests
         *
         * @param request
         * @param response
         */
        httpRequest: function(request, response) {
            // Set isJson flag
            self.isJSON(typeof request.headers.accept !== "undefined" && request.headers.accept.toLowerCase().search("json") !== -1);

            // Try to load data from POST request
            if (request.method === "POST") {
                // Try to get chunks
                request.chunks = [];

                // Get chunks
                request.on("data", function (chunk) {
                    request.chunks.push(chunk.toString());
                });
            }

            // Try to load data from GET request
            else {
                // Get data directly from GET request
                request.body = require("url").parse(request.url, true).query;
            }

            // Add router
            self.getHttpRouter().dispatch(request, response, function(error) {
                if (error) {
                    response.writeHead(404);
                    response.end();
                }
            });
        }
    };

    /**
     * Get http server
     *
     * @returns {*}
     */
    this.getHttpServer = function() {
        return HttpServer;
    };

    /**
     * Get http router
     *
     * @returns {*}
     */
    this.getHttpRouter = function() {
        return HttpRouter;
    };

    /**
     * Get http routing
     *
     * @returns {*}
     */
    this.getHttpRouting = function() {
        return HttpRouting;
    };

    /**
     * Set http routing
     *
     * @param Routing
     */
    this.setHttpRouting = function(Routing) {
        HttpRouting = Routing;
    };

    /**
     * Get web socket server
     *
     * @returns {*}
     */
    this.getWebSocketServer = function() {
        return WebSocketServer;
    };

    /**
     * Get luna communication server version
     *
     * @returns {string}
     */
    this.getVersion = function() {
        return version;
    };

    /**
     * Is initialized? (setter / getter)
     *
     * @param state
     * @returns {boolean}
     */
    this.isInitialized = function(state = null) {
        if (state === null) {
            return isInitialized;
        }

        isInitialized = state;
    };

    /**
     * Is json request? (setter / getter)
     *
     * @param state
     * @returns {boolean}
     */
    this.isJSON = function(state = null) {
        if (state === null) {
            return isJson;
        }

        isJson = state;
    };

    /**
     * Start luna communication server
     *
     * @param host localhost
     * @param port 8080
     * @param options
     *
     *        Example options:
     *        ----------------
     *        {                     // Extra options
     *            ssl: {            // SSL options
     *                key : "",     // SSL key
     *                cert: ""      // SSL certificate
     *            }
     *        }
     */
    this.start = function(host, port, options) {
        // Create basic options structure
        options = {...{
            ssl: undefined
        }, ...options};

        // Luna is already initialized
        if (this.isInitialized ()) {
            // Throw error
            throw new Error("Luna communication server is already initialized and running");
        }

        // Set default host (localhost
        if (typeof host == "undefined") {
            host = "localhost";
        }

        // Set default port (8080)
        if (typeof port == "undefined") {
            port = 8080;
        }

        // Try to include important stuff
        try {
            // Get director
            let director = require("director");

            // Initialize http router
            HttpRouter = new director.http.Router(this.getHttpRouting()).configure({
                // Run when requested page doesn't exist
                notfound: Events.onVisitDefaultPage
            });

            // Check is SSL enabled
            let isSSLEnabled = (typeof options !== "undefined" && typeof options.ssl !== "undefined" && typeof options.ssl.key !== "undefined" && typeof options.ssl.cert !== "undefined");

            // With SSL
            if (isSSLEnabled) {
                // Create file system utils
                let FileSystem = require("fs");

                // HTTPS options
                let httpsOptions = {
                    key: FileSystem.readFileSync(options.ssl.key),
                    cert: FileSystem.readFileSync(options.ssl.cert)
                };

                // Create HTTPS server
                HttpServer = require("https").createServer(httpsOptions, Listeners.httpRequest);
            }

            // Without SSL
            else {
                // Create HTTP server
                HttpServer = require("http").createServer(Listeners.httpRequest);
            }

            // Start listen on selected port and host
            this.getHttpServer().listen(port, host);

            // Include web socket server
            let WebSocketServerBase = require("ws").WebSocketServer;

            // Create web socket server
            WebSocketServer = new WebSocketServerBase({
                server: self.getHttpServer()
            });
        }

        // Something goes wrong
        catch (exception) {
            // Throw error
            throw exception;
        }

        // Set 'error' callback function
        this.getWebSocketServer().on("error", Events.onServerError);

        // Set 'connection' callback function
        this.getWebSocketServer().on("connection", Events.onClientConnect);

        // Change initialization flag
        this.isInitialized(true);
    };

    /**
     * Stop luna communication server
     *
     * @returns {boolean}
     */
    this.stop = function() {
        // Luna is not initialized
        if (!this.isInitialized()) {
            return false;
        }

        // Close server and terminate all web socket clients
        this.getWebSocketServer().close();

        // Close server and terminate all http clients
        this.getHttpServer().close();

        // Change initialization flag
        this.isInitialized(false);

        // Exit
        return true;
    };
};

// Inherit EventEmitter
Luna.prototype = Object.create(EventEmitter.prototype);

/**
 * Export luna communication server with all properties
 */
module.exports = new Luna();