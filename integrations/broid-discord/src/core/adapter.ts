import * as Promise from "bluebird";
import broidSchemas from "broid-schemas";
import { Logger } from "broid-utils";
import * as Discordie from "discordie";
import * as uuid from "node-uuid";
import * as R from "ramda";
import * as request from "request-promise";
import { Observable } from "rxjs/Rx";

const Events: any = Discordie.Events;
import { IAdapterOptions, IChannelInformations, IUserInformations } from "./interfaces";
import Parser from "./parser";

export default class Adapter {
  public serviceID: string;
  public token: string | null;
  private session: any;
  private parser: Parser;
  private logLevel: string;
  private logger: Logger;

  constructor(obj?: IAdapterOptions) {
    this.serviceID = obj && obj.serviceID || uuid.v4();
    this.logLevel = obj && obj.logLevel || "info";
    this.token = obj && obj.token || null;

    this.session = new Discordie({
      autoReconnect: true,
    });
    this.parser = new Parser(this.serviceID, this.logLevel);
    this.logger = new Logger("adapter", this.logLevel);
  }

  // Return list of users information
  public users(): Promise {
    return new Promise((resolve) => {
      const users = this.session.Users.map((u) => {
        const information: IUserInformations = {
          avatar: u.avatar,
          id: u.id,
          is_bot: u.bot,
          username: u.username,
        };

        return information;
      });

      resolve(users);
    });
  }

  // Return list of channels information
  public channels(): Promise {
    return new Promise((resolve) => {
      const channels = this.session.Channels.map((c) => {
        if (c.type !== 0) { return null; }
        const information: IChannelInformations = {
          guildID: c.guild_id,
          id: c.id,
          name: c.name,
          topic: c.topic,
        };

        return information;
      });

      resolve(R.reject(R.isNil)(channels));
    });
  }

  // Return the service ID of the current instance
  public serviceId(): String {
    return this.serviceID;
  }

  // Connect to Discord
  public connect(): Observable<any> {
    if (!this.token) {
      return Observable.throw(new Error("Token should exist."));
    }

    this.session.connect({ token: this.token });

    const connected = Observable
      .fromEvent(this.session.Dispatcher, Events.GATEWAY_READY)
      .map(() => ({ type: "connected", serviceID: this.serviceId() }));

    const disconnected = Observable
      .fromEvent(this.session.Dispatcher, Events.DISCONNECTED)
      .map(() => ({ type: "disconnected", serviceID: this.serviceId() }));

    return Observable.merge(connected, disconnected);
  }

  public disconnect(): Promise<any> {
    return new Promise((resolve) => {
      this.session.disconnect();
      return resolve({ type: "disconnected", serviceID: this.serviceId() });
    });
  }

  // Listen "message" event from Discord
  public listen(): Observable<any> {
    return Observable.merge(
      Observable.fromEvent(this.session.Dispatcher, Events.MESSAGE_CREATE),
      Observable.fromEvent(this.session.Dispatcher, Events.MESSAGE_UPDATE))
      .mergeMap((e: any) => {
        // ignore message from me
        if (R.path(["User", "id"], this.session)
          && R.path(["message", "author", "id"], e) === this.session.User.id) {
          return Promise.resolve(null);
        }

        let msg: any = null;
        if (e.messageId) {
          msg = this.session.Messages.get(e.messageId);
        } else if (e.data) {
          msg = e.data;
        } else if (e.message) {
          msg = e.message.toJSON();
        }

        if (!msg) { return Promise.resolve(null); }
        msg.guild = msg.guild ? msg.guild.toJSON() : null;

        return Promise.resolve(msg)
          .then((m) => {
            let channel: any = this.session.Channels.get(m.channel_id);
            if (!channel) {
              channel = this.session.DirectMessageChannels.get(m.channel_id);
              channel = channel.toJSON();
              channel.isPrivate = true;
            } else {
              channel = channel.toJSON();
            }
            m.channel = channel;
            return m;
          })
          .then((m) => {
            const author = this.session.Users.get(m.author.id);
            m.author = author.toJSON();
            return m;
          });
      })
      .mergeMap((normalized: any) => this.parser.parse(normalized))
      .mergeMap((parsed) => this.parser.validate(parsed))
      .mergeMap((validated) => {
        if (!validated) { return Observable.empty(); }
        return Promise.resolve(validated);
      });
  }

  public send(data: Object): Promise {
    this.logger.debug("sending", { message: data });

    const updateMessage = (message) => {
      if (!R.isEmpty(message.content)) {
        return this.session.Messages.editMessage(message.content, message);
      }
      return this.session.Messages.deleteMessage(message);
    };

    return broidSchemas(data, "send")
      .then(() => {
        const targetType = R.path(["to", "type"], data);
        const targetID = R.path(["to", "id"], data);

        let channel: any = this.session.Channels.get(targetID);
        if (targetType === "Person") {
          channel = this.session.DirectMessageChannels.get(targetID);
        }

        if (!channel) { throw new Error("Channel not found."); }
        return channel;
      })
      .then((channel) => {
        const content = R.path(["object", "content"], data);
        const type = R.path(["object", "type"], data);

        if (type === "Note") {
          const messageID = R.path(["object", "id"], data);
          if (messageID) {
            return updateMessage({ id: messageID, channel_id: channel.id, content });
          }
          return channel.sendMessage(content);
        } else if (type === "Image" || type === "Video") {
          const url  = R.path(["object", "url"], data);
          const name = R.path(["object", "name"], data);

          if (url.startsWith("http://") || url.startsWith("https://")) {
            const stream = request(url);
            return channel.uploadFile(stream, name || content);
          }
        }

        throw new Error("Image, Video and Note are only supported.");
      })
      .then((r) => {
        const d: any = { type: "sent", serviceID: this.serviceId() };
        if (r && r.id) {
          d.id = r.id;
        }
        return d;
      });
  }
}
