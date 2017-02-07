"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const ava_1 = require("ava");
const parser_1 = require("../core/parser");
const callrMessage = require("./fixtures/callr/message.json");
const callrMessageImage = require("./fixtures/callr/messageImage.json");
const callrMessageVideo = require("./fixtures/callr/messageVideo.json");
const broidMessageNormalized = require("./fixtures/broid/normalized/message.json");
const broidMessageNormalizedImage = require("./fixtures/broid/normalized/messageImage.json");
const broidMessageNormalizedVideo = require("./fixtures/broid/normalized/messageVideo.json");
const broidMessage = require("./fixtures/broid/parsed/message.json");
const broidMessageImage = require("./fixtures/broid/parsed/messageImage.json");
const broidMessageVideo = require("./fixtures/broid/parsed/messageVideo.json");
let parser;
ava_1.default.before(() => {
    parser = new parser_1.default("test_service", "info");
});
ava_1.default("Parse a null", (t) => __awaiter(this, void 0, void 0, function* () {
    const data = parser.parse(null);
    t.deepEqual(yield data, null);
}));
ava_1.default("Normalize a null", (t) => __awaiter(this, void 0, void 0, function* () {
    const data = parser.normalize({});
    t.deepEqual(yield data, null);
}));
ava_1.default("Normalize a simple message", (t) => __awaiter(this, void 0, void 0, function* () {
    const data = parser.normalize(callrMessage);
    t.deepEqual(yield data, broidMessageNormalized);
}));
ava_1.default("Normalize a message with image", (t) => __awaiter(this, void 0, void 0, function* () {
    const data = parser.normalize(callrMessageImage);
    t.deepEqual(yield data, broidMessageNormalizedImage);
}));
ava_1.default("Normalize a message with video", (t) => __awaiter(this, void 0, void 0, function* () {
    const data = parser.normalize(callrMessageVideo);
    t.deepEqual(yield data, broidMessageNormalizedVideo);
}));
ava_1.default("Parse a simple message", (t) => __awaiter(this, void 0, void 0, function* () {
    const data = parser.parse(broidMessageNormalized);
    t.deepEqual(yield data, broidMessage);
}));
ava_1.default("Parse a message with image", (t) => __awaiter(this, void 0, void 0, function* () {
    const data = parser.parse(broidMessageNormalizedImage);
    t.deepEqual(yield data, broidMessageImage);
}));
ava_1.default("Parse a message with video", (t) => __awaiter(this, void 0, void 0, function* () {
    const data = parser.parse(broidMessageNormalizedVideo);
    t.deepEqual(yield data, broidMessageVideo);
}));
ava_1.default("Validate a simple message", (t) => __awaiter(this, void 0, void 0, function* () {
    const data = parser.validate(broidMessage);
    t.deepEqual(yield data, broidMessage);
}));
ava_1.default("Validate a message with image", (t) => __awaiter(this, void 0, void 0, function* () {
    const data = parser.validate(broidMessageImage);
    t.deepEqual(yield data, broidMessageImage);
}));
ava_1.default("Validate a message with video", (t) => __awaiter(this, void 0, void 0, function* () {
    const data = parser.validate(broidMessageVideo);
    t.deepEqual(yield data, broidMessageVideo);
}));
