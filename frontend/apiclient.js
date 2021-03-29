"use strict";

class ApiClient {
    constructor(onOpen = null, onClose = null, onError = null, onSession = null, server = null) {
        this.server = server;
        this.connected = false;
        this.isConnecting = false;
        this._wsCallbacks = {};
        this._wsTimeouts = {};
        this._wsPushCallbacks = {};
        this.socket = null;
        this.onOpen = onOpen;
        this.onError = onError;
        this.onClose = onClose;
        this.onSession = onSession;
        this.connectTimeout = null;
        this.pingTimeout = null;
        this.pingRequestTimeout = null;
        this.token = null;
        this.cookie = null;
        this.session = null;
        window.electron.receive('error', this._handleError.bind(this));
        window.electron.receive('close', this._handleClose.bind(this));
        window.electron.receive('response', this._handleResponse.bind(this));
    }

    connect() {
        this.connected = true;
        clearTimeout(this.pingTimeout);
        clearTimeout(this.pingRequestTimeout);
        this.pingRequestTimeout = setTimeout(this._ping.bind(this), 1);
        if (typeof this.onOpen === "function") {
            this.onOpen();
        }
    }

    _ping() {
        if (this.connected) {
            clearTimeout(this.pingTimeout);
            clearTimeout(this.pingRequestTimeout);
            this.pingTimeout = setTimeout(this._onPingTimeout.bind(this), 1000);
            if (this.token !== null) {
                this.request('session/state', null, this._onSessionStateResponse.bind(this));
            } else {
                console.log("No token");
                this.request('session/create', null, this._onSessionCreateResponse.bind(this));
            }
        }
    }

    logout(callback = null) {
        if (this.connected) {
            this.request('session/destroy', null, callback);
            this.token = null;
            this.session = null;
            if (typeof this.onSession === "function") {
                this.onSession(null);
            }
            this._ping();
        }
    }
    
    login(username, password, callback = null) {
        if (this.connected) {
            if (this.session === null) {
                throw "Session unavailable";
            }
            this.request('user/authenticate', {username: username, password: password}, (result, error) => {
                this._ping();
                if (typeof callback === "function") {
                    callback(result, error);
                }
            });
        }
    }

    _onSessionCreateResponse(result, error) {
        clearTimeout(this.pingTimeout);
        clearTimeout(this.pingRequestTimeout);
        this.pingRequestTimeout = setTimeout(this._ping.bind(this), 1);
        if (result) {
            this.token = result;
            this.session = null;
            if (typeof this.onSession === "function") {
                this.onSession(null);
            }
        }
        if (error) {
            console.log("Failed to create session:", error);
        }
    }
    
    _onSessionStateResponse(result, error) {
        clearTimeout(this.pingTimeout);
        clearTimeout(this.pingRequestTimeout);
        this.pingRequestTimeout = setTimeout(this._ping.bind(this), 2000);
        if (error) {
            if (error.code === -32001) {
                console.error("Session token is invalid");
                this.token = null; // Session is invalid
                this.session = null;
                if (typeof this.onSession === "function") {
                    this.onSession(null);
                }
            }
        }
        if (result) {
            this.session = result;
            if (typeof this.onSession === "function") {
                this.onSession(result);
            }
        }
    }

    _onPingTimeout() {
        console.log("Ping timeout");
        if (this.socket !== null) {
            this.socket.close();
        }
    }

    _handleError(source, ...args) {
        if (typeof this.onError === "function") {
            this.onError(source, ...args);
        } else {
            console.log("API error ("+source+")", ...args);
        }
    }

    _handleClose() {
        if (typeof this.onClose === "function") {
            this.onClose();
        }
    }

    _handleResponse(message) {
        try {
            message = JSON.parse(message);
            if (typeof message === 'string') {
                message = {result: null, err: message};
            } else {
                if (typeof message.result === 'undefined') message.result = null;
                if (typeof message.error === 'undefined') message.error = null;
            }
            if ((typeof message.pushMessage === 'boolean') && (message.pushMessage)) {
                if (message.subject in this._wsPushCallbacks) {
                this._wsPushCallbacks[message.subject](message.message);
                } else {
                console.error("Push message ignored, no callback available", message);
                }
            } else {
                if (typeof message.id !== 'undefined') {
                if (typeof this._wsCallbacks[message.id]==='function') {
                    this._wsCallbacks[message.id](message.result, message.error);
                    delete this._wsCallbacks[message.id];
                } else {
                    console.error("Response ignored, no callback available", message);
                }
                } else {
                this._handleError("No identifier in response", message);
                }
            }
        } catch(error) {
            this._handleError("Exception while handling API response", error);
        }
    }

    generateUid() {
        return (Date.now().toString(36) + Math.random().toString(36).substr(2, 5)).toUpperCase();
    }

    request(method='ping', params=null, callback=null, timeout=null) {
        var uid = this.generateUid();
        if (typeof callback === 'function') {
            this._wsCallbacks[uid] = callback.bind(this);
        }
        window.electron.send('request', {jsonrpc: "2.0", id: uid, method: method, params: params, token: this.token});
        return uid;
    }
}
