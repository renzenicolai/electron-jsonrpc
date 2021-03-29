"use strict";
const electron = require('electron');
const fs = require('fs');
const path = require('path');
const { Rpc, SessionManager } = require('nicolai-jsonrpc');

/* Electron window */

var window = null;

function createWindow () {
    window = new electron.BrowserWindow({
        width: 1024,
        height: 768,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: "favicon.ico"
    });
    
    //window.removeMenu();
    window.loadFile(path.join(__dirname, 'frontend', 'index.html'));
}

electron.app.allowRendererProcessReuse = true;
electron.app.whenReady().then(createWindow);

electron.app.on('window-all-closed', () => {
    electron.app.quit();
});

/* Communication with frontend */

var sessionManager = new SessionManager();
var rpc = new Rpc("API", sessionManager);

electron.ipcMain.on('request', async (event, request) => {
    console.log("Received API request:", request);
    event.reply('response', await rpc.handle(request));
});

/* Application */

class User {
    constructor(username) {
        this.username = username;
        this.permissions = [];
    }
    
    serialize() {
        return {username: this.username};
    }
    
    getPermissions() {
        return this.permissions;
    }
    
    checkPermission(method) {
        for (let index = 0; index < this.permissions.length; index++) {
            if (method.startsWith(this.permissions[index])) {
                return true;
            }
        }
        return false;
    }
}

async function authenticate(parameters, session) {
    if (session === null) {
        throw "Invalid session";
    }
    session.setUser(new User(parameters.username));
}

rpc.addMethod(
    "user/authenticate",
    authenticate,
    {
        type: "object",
        required: {
            username: {
                type: "string"
            }
        },
        optional: {
            password: {
                type: "string"
            }
        }
    },
    {
        type: "none"
    },
    true
);

rpc.addMethod(
    "example",
    // eslint-disable-next-line no-unused-vars
    async (parameters, session) => {
        return "Hello world!";
    },
    [
        {type: "none"}
    ],
    {type: "string", description: "How does one describe \"Hello world!\"? Like this apparently..."},
    true
);
