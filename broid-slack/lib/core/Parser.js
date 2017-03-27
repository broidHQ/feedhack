"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const schemas_1 = require("@broid/schemas");
const utils_1 = require("@broid/utils");
const Promise = require("bluebird");
const mimetype = require("mimetype");
const uuid = require("node-uuid");
const R = require("ramda");
const validUrl = require("valid-url");
class Parser {
    constructor(serviceID, logLevel) {
        this.serviceID = serviceID;
        this.generatorName = 'slack';
        this.logger = new utils_1.Logger('parser', logLevel);
    }
    validate(event) {
        this.logger.debug('Validation process', { event });
        const parsed = utils_1.cleanNulls(event);
        if (!parsed || R.isEmpty(parsed)) {
            return Promise.resolve(null);
        }
        if (!parsed.type) {
            this.logger.debug('Type not found.', { parsed });
            return Promise.resolve(null);
        }
        return schemas_1.default(parsed, 'activity')
            .then(() => parsed)
            .catch((err) => {
            this.logger.error(err);
            return null;
        });
    }
    parse(event) {
        this.logger.debug('Parse process', { event });
        const normalized = utils_1.cleanNulls(event);
        if (!normalized || R.isEmpty(normalized)) {
            return Promise.resolve(null);
        }
        const activitystreams = this.createActivityStream(normalized);
        activitystreams.actor = {
            id: R.path(['user', 'id'], normalized),
            name: R.path(['user', 'name'], normalized),
            type: R.path(['user', 'is_bot'], normalized) ? 'Application' : 'Person',
        };
        activitystreams.target = {
            id: R.path(['channel', 'id'], normalized),
            name: R.path(['channel', 'id'], normalized) || R.path(['channel', 'user'], normalized),
            type: R.path(['channel', 'is_im'], normalized) ? 'Person' : 'Group',
        };
        let url = normalized.text.substr(1);
        url = url.substring(0, url.length - 1);
        if (validUrl.isWebUri(url)) {
            const mediaType = mimetype.lookup(url);
            if (mediaType.startsWith('image/')) {
                activitystreams.object = {
                    id: normalized.eventID || this.createIdentifier(),
                    mediaType,
                    type: 'Image',
                    url,
                };
            }
            else if (mediaType.startsWith('video/')) {
                activitystreams.object = {
                    id: normalized.eventID || this.createIdentifier(),
                    mediaType,
                    type: 'Video',
                    url,
                };
            }
        }
        if (normalized.file) {
            const attachment = this.parseFile(normalized.file);
            if (attachment) {
                activitystreams.object = {
                    content: attachment.content,
                    id: normalized.ts || this.createIdentifier(),
                    mediaType: attachment.mediaType,
                    name: attachment.name,
                    type: attachment.type,
                    url: attachment.url,
                };
                if (attachment.preview) {
                    activitystreams.object.preview = attachment.preview;
                }
            }
        }
        if (!activitystreams.object && !R.isEmpty(normalized.content)) {
            activitystreams.object = {
                content: normalized.text,
                id: normalized.ts || this.createIdentifier(),
                type: 'Note',
            };
        }
        if (activitystreams.object && normalized.subtype === 'interactive_message') {
            activitystreams.object.context = {
                content: `${normalized.callback_id}#${normalized.response_url}`,
                name: 'interactive_message_callback',
                type: 'Object',
            };
        }
        return Promise.resolve(activitystreams);
    }
    createIdentifier() {
        return uuid.v4();
    }
    createActivityStream(normalized) {
        return {
            '@context': 'https://www.w3.org/ns/activitystreams',
            'generator': {
                id: this.serviceID,
                name: this.generatorName,
                type: 'Service',
            },
            'published': normalized.ts ?
                this.ts2Timestamp(normalized.ts)
                : Math.floor(Date.now() / 1000),
            'type': 'Create',
        };
    }
    ts2Timestamp(ts) {
        const n = Number(ts.split('.')[0]);
        return new Date(n * 1000).getTime() / 1000;
    }
    parseFile(attachment) {
        if (attachment.mimetype.startsWith('image')
            || attachment.mimetype.startsWith('video')) {
            let mType = 'Image';
            if (attachment.mimetype.startsWith('video')) {
                mType = 'Video';
            }
            const a = {
                mediaType: attachment.mimetype,
                name: attachment.name,
                type: mType,
                url: attachment.permalink_public,
            };
            if (attachment.thumb_1024) {
                a.preview = attachment.thumb_1024;
            }
            if (R.is(Array, attachment.initial_comment)) {
                a.content = attachment.initial_comment[0].comment || '';
            }
            else {
                a.content = attachment.initial_comment.comment || '';
            }
            return a;
        }
        return null;
    }
}
exports.Parser = Parser;
