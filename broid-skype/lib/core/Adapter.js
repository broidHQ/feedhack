"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const schemas_1 = require("@broid/schemas");
const utils_1 = require("@broid/utils");
const Promise = require("bluebird");
const botbuilder = require("botbuilder");
const express_1 = require("express");
const mimetype = require("mimetype");
const uuid = require("node-uuid");
const R = require("ramda");
const Rx_1 = require("rxjs/Rx");
const Parser_1 = require("./Parser");
const WebHookServer_1 = require("./WebHookServer");
class Adapter {
    constructor(obj) {
        this.serviceID = obj && obj.serviceID || uuid.v4();
        this.logLevel = obj && obj.logLevel || 'info';
        this.token = obj && obj.token || null;
        this.tokenSecret = obj && obj.tokenSecret || null;
        this.storeUsers = new Map();
        this.storeAddresses = new Map();
        this.parser = new Parser_1.Parser(this.serviceName(), this.serviceID, this.logLevel);
        this.logger = new utils_1.Logger('adapter', this.logLevel);
        this.router = express_1.Router();
        if (obj.http) {
            this.webhookServer = new WebHookServer_1.WebHookServer(obj.http, this.router, this.logLevel);
        }
    }
    users() {
        return Promise.resolve(this.storeUsers);
    }
    channels() {
        return Promise.reject(new Error('Not supported'));
    }
    addresses(id) {
        const data = this.storeAddresses.get(id);
        if (data) {
            return Promise.resolve(data);
        }
        return Promise.reject(new Error(`Address ${id} not found`));
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
        return 'skype';
    }
    connect() {
        if (this.connected) {
            return Rx_1.Observable.of({ type: 'connected', serviceID: this.serviceId() });
        }
        if (!this.token
            || !this.tokenSecret) {
            return Rx_1.Observable.throw(new Error('Credentials should exist.'));
        }
        this.sessionConnector = new botbuilder.ChatConnector({
            appId: this.token,
            appPassword: this.tokenSecret,
        });
        this.session = new botbuilder.UniversalBot(this.sessionConnector);
        this.connected = true;
        this.router.post('/', this.sessionConnector.listen());
        if (this.webhookServer) {
            this.webhookServer.listen();
        }
        return Rx_1.Observable.of({ type: 'connected', serviceID: this.serviceId() });
    }
    disconnect() {
        this.connected = false;
        if (this.webhookServer) {
            return this.webhookServer.close();
        }
        return Promise.resolve(null);
    }
    listen() {
        return Rx_1.Observable.create((observer) => {
            this.session.dialog('/', (event) => {
                this.storeAddresses.set(R.path(['message', 'address', 'id'], event), R.path(['message', 'address'], event));
                this.storeUsers.set(R.path(['message', 'user', 'id'], event), R.path(['message', 'user'], event));
                return Promise.resolve(event.message)
                    .then((normalized) => this.parser.parse(normalized))
                    .then((parsed) => this.parser.validate(parsed))
                    .then((validated) => {
                    if (validated) {
                        return observer.next(validated);
                    }
                    return null;
                })
                    .catch((error) => this.logger.error(error));
            });
        });
    }
    send(data) {
        this.logger.debug('sending', { message: data });
        return schemas_1.default(data, 'send')
            .then(() => {
            const context = R.path(['object', 'context', 'content'], data);
            const content = R.path(['object', 'content'], data);
            const name = R.path(['object', 'name'], data);
            const dataType = R.path(['object', 'type'], data);
            const contextArr = R.split('#', context);
            const addressID = contextArr[0];
            let address = this.storeAddresses.get(addressID);
            if (!address) {
                if (R.length(contextArr) !== 4) {
                    return Promise
                        .reject(new Error('Context value should use the form: address.id#address.conversation.id#channelId#bot.id'));
                }
                const conversationID = contextArr[1];
                const channelID = contextArr[2];
                const botID = contextArr[3];
                const userID = R.path(['to', 'id'], data);
                address = {
                    bot: { id: botID },
                    channelId: channelID,
                    conversation: { id: conversationID },
                    id: addressID,
                    serviceUrl: `https://${channelID}.botframework.com`,
                    useAuth: true,
                    user: { id: userID },
                };
            }
            const attachmentButtons = R.filter((attachment) => attachment.type === 'Button', R.path(['object', 'attachment'], data) || []);
            const messageButtons = R.map((button) => {
                if (button.mediaType === 'text/html') {
                    return new botbuilder.CardAction()
                        .type('openUrl')
                        .value(button.url)
                        .title(button.name || button.content || 'Click to open website in your browser');
                }
                else if (button.mediaType === 'audio/telephone-event') {
                    return new botbuilder.CardAction()
                        .type('call')
                        .value(`tel:${button.url}`)
                        .title(button.name || button.content || 'Click to call');
                }
                return new botbuilder.CardAction()
                    .type('imBack')
                    .value(button.url)
                    .title(button.name || button.content || 'Click to send response to bot');
            }, attachmentButtons);
            let messageAttachments = [];
            const messageBuilder = new botbuilder.Message()
                .textFormat(botbuilder.TextFormat.markdown)
                .address(address);
            if (dataType === 'Note') {
                if (!messageButtons) {
                    messageBuilder.text(content);
                }
                else {
                    messageAttachments = [
                        new botbuilder.HeroCard().title(name).text(content).buttons(messageButtons),
                    ];
                }
            }
            else if (dataType === 'Image' || dataType === 'Video') {
                const url = R.path(['object', 'url'], data);
                const hero = new botbuilder.HeroCard().title(name).text(content);
                if (messageButtons) {
                    hero.buttons(messageButtons);
                }
                if (dataType === 'Image') {
                    hero.images([new botbuilder.CardImage().url(url)]);
                    messageAttachments = [hero];
                }
                else {
                    messageAttachments = [{
                            contentType: mimetype.lookup(url),
                            contentUrl: url,
                        }, hero];
                }
            }
            if (dataType === 'Note' || dataType === 'Image' || dataType === 'Video') {
                messageBuilder.attachments(messageAttachments);
                return Promise.fromCallback((cb) => this.session.send(messageBuilder, cb))
                    .then(() => ({ serviceID: this.serviceId(), type: 'sent' }));
            }
            return Promise.reject(new Error('Only Note, Image, and Video are supported.'));
        });
    }
}
exports.Adapter = Adapter;
