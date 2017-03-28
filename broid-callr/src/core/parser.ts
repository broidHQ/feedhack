import * as Promise from "bluebird";
import broidSchemas from "@broid/schemas";
import { cleanNulls, Logger } from "@broid/utils";
import * as mimetype from "mimetype";
import * as uuid from "node-uuid";
import * as R from "ramda";
import * as validUrl from "valid-url";

import { IActivityStream, ICallrWebHookEvent } from "./interfaces";

export default class Parser {
  public serviceID: string;
  public generatorName: string;
  private logger: Logger;

  constructor(serviceName: string, serviceID: string, logLevel: string) {
    this.serviceID = serviceID;
    this.generatorName = serviceName;
    this.logger = new Logger("parser", logLevel);
  }

  // Validate parsed data with Broid schema validator
  public validate(event: any): Promise<Object> {
    this.logger.debug("Validation process", { event });

    const parsed = cleanNulls(event);
    if (!parsed || R.isEmpty(parsed)) { return Promise.resolve(null); }

    if (!parsed.type) {
      this.logger.debug("Type not found.", { parsed });
      return Promise.resolve(null);
    }

    return broidSchemas(parsed, "activity")
      .then(() => parsed)
      .catch((err) => {
        this.logger.error(err);
        return null;
      });
  }

  // Convert normalized data to Broid schema
  public parse(event: any): Promise<IActivityStream> {
    this.logger.debug("Normalize process", { event });

    const normalized = cleanNulls(event);
    if (!normalized || R.isEmpty(normalized)) { return Promise.resolve(null); }

    const activitystreams = this.createActivityStream(normalized);
    activitystreams.actor = {
      id: normalized.senderPhoneNumber,
      name: normalized.senderPhoneNumber,
      type: "Person",
    };

    activitystreams.target = {
      id: normalized.toPhoneNumber,
      name: normalized.toPhoneNumber,
      type: "Person",
    };

    // Process potentially media.
    if (validUrl.isUri(normalized.text)) {
      const mediaType = mimetype.lookup(normalized.text);
      if (mediaType.startsWith("image/")) {
        activitystreams.object = {
          id: normalized.eventID || this.createIdentifier(),
          mediaType,
          type: "Image",
          url: normalized.text,
        };
      } else if (mediaType.startsWith("video/")) {
        activitystreams.object = {
          id: normalized.eventID || this.createIdentifier(),
          mediaType,
          type: "Video",
          url: normalized.text,
        };
      }
    }

    if (R.isEmpty(activitystreams.object) && !R.isEmpty(normalized.text)) {
      activitystreams.object = {
        content: normalized.text,
        id: normalized.eventID || this.createIdentifier(),
        type: "Note",
      };
    }

    return Promise.resolve(activitystreams);
  }

  // Normalize the raw event
  public normalize(event: ICallrWebHookEvent): Promise<any> {
    this.logger.debug("Event received to normalize");

    const body = R.path(["request", "body"], event);

    if (!body || R.isEmpty(body)) { return Promise.resolve(null); }

    const type = body.type;
    if (type !== "sms.mo") { return Promise.resolve(null); }

    const senderPhoneNumber = R.path(["data", "from"], body);
    const toPhoneNumber = R.path(["data", "to"], body);
    const text = R.path(["data", "text"], body);
    const eventID = R.path(["event_id"], body);
    const eventAt = R.path(["event_at"], body);

    const data = {
      eventID,
      senderPhoneNumber,
      text,
      timestamp: new Date(eventAt).getTime(),
      toPhoneNumber,
      type,
    };

    return Promise.resolve(data);
  }

  private createIdentifier(): string {
    return uuid.v4();
  }

  private createActivityStream(normalized): IActivityStream {
    return {
      "@context": "https://www.w3.org/ns/activitystreams",
      "actor": {},
      "generator": {
        id: this.serviceID,
        name: this.generatorName,
        type: "Service",
      },
      "object": {},
      "published": normalized.timestamp || Math.floor(Date.now() / 1000),
      "target": {},
      "type": "Create",
    };
  }
}
