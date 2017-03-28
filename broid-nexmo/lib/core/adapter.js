"use strict";
const Promise = require("bluebird");
<<<<<<< HEAD
const broid_schemas_1 = require("broid-schemas");
const broid_utils_1 = require("broid-utils");
const events_1 = require("events");
const express_1 = require("express");
=======
const schemas_1 = require("@broid/schemas");
const utils_1 = require("@broid/utils");
>>>>>>> devel
const Nexmo = require("nexmo");
const uuid = require("node-uuid");
const R = require("ramda");
const Rx_1 = require("rxjs/Rx");
const parser_1 = require("./parser");
const webHookServer_1 = require("./webHookServer");
class Adapter {
    constructor(obj) {
        this.serviceID = obj && obj.serviceID || uuid.v4();
        this.logLevel = obj && obj.logLevel || "info";
        this.token = obj && obj.token || null;
        this.tokenSecret = obj && obj.tokenSecret || null;
        this.username = obj && obj.username || null;
<<<<<<< HEAD
        this.parser = new parser_1.default(this.serviceName(), this.serviceID, this.logLevel);
        this.logger = new broid_utils_1.Logger("adapter", this.logLevel);
        this.emitter = new events_1.EventEmitter();
        this.router = this.setupRouter();
        if (obj.http) {
            this.webhookServer = new webHookServer_1.default(obj.http, this.router, this.logLevel);
        }
=======
        const HTTPOptions = {
            host: "127.0.0.1",
            port: 8080,
        };
        this.HTTPOptions = obj && obj.http || HTTPOptions;
        this.HTTPOptions.host = this.HTTPOptions.host || HTTPOptions.host;
        this.HTTPOptions.port = this.HTTPOptions.port || HTTPOptions.port;
        this.parser = new parser_1.default(this.serviceID, this.logLevel);
        this.logger = new utils_1.Logger("adapter", this.logLevel);
>>>>>>> devel
    }
    users() {
        return Promise.reject(new Error("Not supported"));
    }
    channels() {
        return Promise.reject(new Error("Not supported"));
    }
    serviceId() {
        return this.serviceID;
    }
    getRouter() {
        if (this.webhookServer) {
            return null;
        }
        return this.router;
    }
    serviceName() {
        return "nexmo";
    }
    connect() {
        if (this.connected) {
            return Rx_1.Observable.of({ type: "connected", serviceID: this.serviceId() });
        }
        this.connected = true;
        if (!this.token || this.token === "") {
            return Rx_1.Observable.throw(new Error("Token should exist."));
        }
        if (!this.tokenSecret || this.tokenSecret === "") {
            return Rx_1.Observable.throw(new Error("TokenSecret should exist."));
        }
        this.session = new Nexmo({
            apiKey: this.token,
            apiSecret: this.tokenSecret,
        });
        if (this.webhookServer) {
            this.webhookServer.listen();
        }
        return Rx_1.Observable.of(({ type: "connected", serviceID: this.serviceId() }));
    }
    disconnect() {
        this.connected = false;
        if (this.webhookServer) {
            return this.webhookServer.close();
        }
        return Promise.resolve(null);
    }
    listen() {
        if (!this.webhookServer) {
            return Rx_1.Observable.throw(new Error("No webhookServer found."));
        }
        return Rx_1.Observable.fromEvent(this.emitter, "message")
            .mergeMap((normalized) => this.parser.parse(normalized))
            .mergeMap((parsed) => this.parser.validate(parsed))
            .mergeMap((validated) => {
            if (!validated) {
                return Rx_1.Observable.empty();
            }
            return Promise.resolve(validated);
        });
    }
    send(data) {
        this.logger.debug("sending", { message: data });
        return schemas_1.default(data, "send")
            .then(() => {
            if (data.object.type !== "Note") {
                return Promise.reject(new Error("Only Note is supported."));
            }
            return Promise.resolve(data)
                .then((result) => {
                const toNumber = R.path(["to", "id"], result);
                const content = R.path(["object", "content"], result);
                return Promise.fromCallback((cb) => this.session.message.sendSms(this.username, toNumber, content, {}, cb));
            })
                .then((result) => {
                const ids = R.map((message) => message["message-id"], result.messages);
                return { type: "sent", serviceID: this.serviceId(), ids };
            });
        });
    }
    setupRouter() {
        const router = express_1.Router();
        const handle = (req, res) => {
            let query = {};
            if (req.method === "GET") {
                query = req.query;
            }
            else if (req.method === "POST") {
                query = req.body;
            }
            const message = {
                keyword: query.keyword,
                messageId: query.messageId,
                msisdn: query.msisdn,
                text: query.text,
                timestamp: query["message-timestamp"],
                to: query.to,
            };
            this.emitter.emit("message", message);
            res.sendStatus(200);
        };
        router.get("/", handle);
        router.post("/", handle);
        return router;
    }
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Adapter;
