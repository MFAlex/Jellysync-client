import { defineStore } from "pinia";
import { useAuthStore } from "./authStore";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { AudioEntry, SubtitleEntry } from "@/jellyfin/playback-urls";

export const websocketUrl = import.meta.env.VITE_JELLYSYNC_SERVER_URL as string;

export type PlayingState =
  | "playing"
  | "paused"
  | "buffering"
  | "nothing-playing";

export interface SyncSessionMember { 
  index: number;
  displayName: string;
  displayNameColor: string;
}

export interface CreateRoomRequest {
  type: "create";
  displayName: string;
  displayNameColor: string;
  jellyfinHost: string;
}

export interface JoinRoomRequest {
  type: "join";
  room: string;
  displayName: string;
  displayNameColor: string;
}

export interface SyncSession {
  type: "session";
  room: string;
  leader: number;
  you: number;
  members: SyncSessionMember[];
  jellyfinHost: string;
}

export interface SyncSessionLeaderChange {
  type: "leader-change";
  newLeader: number;
}

export interface SyncSessionMemberChange {
  type: "member-change";
  members: SyncSessionMember[];
}

export interface SyncSessionMemberPlaybackState {
  type: "member-playback-state";
  state: PlayingState;
  member: number;
  timestamp?: number;
  bufferSecs?: number;
}

export interface SyncSessionChangePlaybackState {
  type: "change-playback-state";
  state: PlayingState; //playing or paused
  timestamp: number;
  media?: string;
}

export interface SyncSessionPlaybackState {
  type: "playback-state";
  state: PlayingState;
  timestamp?: number;
  media?: string;
}

export interface SyncSessionChatMessage {
  type: "chat";
  member: "system" | number;
  message: string;
  sequence?: number;
}

export interface SyncSessionStateChatMessage {
  member: "system" | string;
  displayNameColor: string;
  message: string;
  newerThan5Secs: boolean;
  index: number;
  time: Date;
}

export interface SyncSessionSendChatMessage {
  type: "chat";
  message: string;
  sequence: number;
}

export const useSyncStore = defineStore("sync", {
  state: () => ({
    session: null as null | SyncSession,
    serverIndex: -1,
    socket: null as null | WebSocket,
    chatIndex: 0,
    chat: [] as SyncSessionStateChatMessage[],

    serverPlaybackState: "nothing-playing" as PlayingState,
    playbackState: "nothing-playing" as PlayingState,
    playbackTimestamp: null as null | number,
    playbackBuffer: null as null | number,
    playbackDuration: null as null | number,
    playbackAudioTrack: -1,
    playbackSubtitleTrack: -1,
    playerVolume: 1.0,
    lastPlayed: null as null | BaseItemDto,

    serverPlaybackTimestamp: null as null | number, //when the server requests to change timestamp
    media: null as null | string,
    playbackStates: [] as SyncSessionMemberPlaybackState[],
    connectedPublicAddress: null as null | string,
    chatSequence: 0,
    mediaAnnounceInterval: null as null | NodeJS.Timeout,
    trafficTimeout: null as null | NodeJS.Timeout,
    mediaDetails: null as null | BaseItemDto,
    mediaSubtitleDetails: null as null | SubtitleEntry[],
    mediaAudioDetails: null as null | AudioEntry[],
  }),
  getters: {
    getPlaybackStateByIndex: (state) => {
      return (index: number): SyncSessionMemberPlaybackState | undefined => {
        return state.playbackStates.find((it) => it.member == index);
      };
    },
    getDisplayNameForUser: (state) => {
      return (index: number): string => {
        return (
          state.session?.members.find((it) => it.index == index)?.displayName ??
          "Unknown"
        );
      };
    },
    getDisplayNameColorForUser: (state) => {
      return (index: number): string => {
        return (
          state.session?.members.find((it) => it.index == index)?.displayNameColor ??
          "Unknown"
        );
      };
    },
  },
  actions: {
    onRoomDisconnect() {
      if (this.socket != null) this.socket.close();
      if (this.trafficTimeout != null) clearTimeout(this.trafficTimeout);
      if (this.mediaAnnounceInterval != null)
        clearInterval(this.mediaAnnounceInterval);
      this.$patch((state) => {
        state.session = null;
        state.socket = null;
        state.chat = [];
        state.serverPlaybackState = "nothing-playing";
        state.playbackState = "nothing-playing";
        state.media = null;
        state.playbackStates = [];
        state.trafficTimeout = null;
        state.mediaAnnounceInterval = null;
        state.serverIndex = -1;
        state.playbackDuration = null;
        state.playbackAudioTrack = -1;
        state.playbackSubtitleTrack = -1;
        state.mediaAudioDetails = null;
        state.mediaSubtitleDetails = null;
      });
    },
    setSocket(socket: WebSocket) {
      this.$patch((state) => {
        state.socket = socket;
      });
    },
    setLastPlayed(lastPlayed: BaseItemDto) {
      this.$patch((state) => {
        state.lastPlayed = lastPlayed;
      });
    },
    joinedSession(session: SyncSession) {
      this.$patch((state) => {
        state.session = session;
        state.connectedPublicAddress = session.jellyfinHost;

        const authStore = useAuthStore();
        state.serverIndex = authStore.getIndexByAddress(
          state.connectedPublicAddress
        );
      });
      this.onReceivedPing();
      this.announceMediaStatus();
    },
    updateMembers(newMembers: SyncSessionMember[]) {
      this.$patch((state) => {
        if (state.session != null) {
          state.session.members = newMembers;
        }
        //get rid of any users that don't exist from the playstate:
        state.playbackStates = state.playbackStates.filter(
          (it) => newMembers.findIndex((it2) => it2.index == it.member) !== -1
        );
      });
    },
    onReceivedPing() {
      if (this.trafficTimeout != null) {
        clearTimeout(this.trafficTimeout);
      }
      this.trafficTimeout = setTimeout(this.onRoomDisconnect, 15000);
    },
    onReceivedPlaybackState(newState: SyncSessionMemberPlaybackState) {
      this.$patch((state) => {
        const index = state.playbackStates.findIndex(
          (it) => it.member == newState.member
        );
        if (index == -1) {
          state.playbackStates.push(newState);
        } else {
          state.playbackStates[index] = newState;
        }
      });
    },
    onReceiveChatMessage(message: SyncSessionChatMessage) {
      const obj = {
        member:
          message.member === "system"
            ? "system"
            : this.getDisplayNameForUser(message.member),
        message: message.message,
        displayNameColor: message.member !== "system" ? this.getDisplayNameColorForUser(message.member) : "lightgray",
        newerThan5Secs: true,
        index: this.chatIndex++,
        time: new Date(),
      };
      this.$patch((state) => {
        state.chat.push(obj);
        if (state.chat.length >= 100) {
          state.chat.shift();
        }
      });
      setTimeout(() => {
        this.$patch((state) => {
          const chatMessage = state.chat.find((it) => it.index === obj.index);
          if (chatMessage != null) {
            chatMessage.newerThan5Secs = false;
          }
        });
      }, 5000);
    },
    sendChatMessage(message: string) {
      this.socket?.send(
        JSON.stringify({ type: "chat", message, sequence: this.chatSequence })
      );
      this.chatSequence += 1;
    },
    announceMediaStatus() {
      //ensure we send something once every 3 seconds minimum
      if (this.mediaAnnounceInterval != null) {
        clearTimeout(this.mediaAnnounceInterval);
      }
      this.mediaAnnounceInterval = setTimeout(() => {
        this.announceMediaStatus();
      }, 3000);

      const packet = {
        type: "member-playback-state",
        state: this.playbackState,
      } as any;
      if (this.playbackState != "nothing-playing") {
        if (
          this.media == null ||
          this.playbackTimestamp == null ||
          this.playbackBuffer == null
        )
          return; //otherwise server will just kick us
        packet["media"] = this.media;
        packet["timestamp"] = this.playbackTimestamp;
        packet["bufferSecs"] = this.playbackBuffer;
      }
      this.socket?.send(JSON.stringify(packet));
    },
    leaderChangeMedia(media: string) {
      if (this.session == null || this.session.you != this.session.leader)
        return;
      const packet = {
        type: "change-playback-state",
        state: "playing",
        media,
        timestamp: 0.0,
      } as any;
      this.socket?.send(JSON.stringify(packet));
    },
    changeMediaState(
      state: PlayingState,
      timestamp: number | null,
      media: string | null
    ) {
      if (media != null) {
        this.media = media;
      }
      if (state != "nothing-playing") {
        this.serverPlaybackTimestamp = timestamp;
        this.serverPlaybackState = state;
        if (this.playbackState == "nothing-playing") {
          this.playbackState = "buffering";
          this.announceMediaStatus();
        }
      }
    },
    vJSPlaybackEnded() {
      this.$patch((state) => {
        state.playbackState = "nothing-playing";
        state.serverPlaybackState = "nothing-playing";
        state.playbackTimestamp = null;
        state.playbackBuffer = null;
        state.mediaDetails = null;
        state.mediaAudioDetails = null;
        state.mediaSubtitleDetails = null;
        state.playbackDuration = null;
        state.playbackAudioTrack = -1;
        state.playbackSubtitleTrack = -1;
      });
      this.announceMediaStatus();
    },
    vJSBufferSecs(length: number, currentTime: number, canPlay: boolean) {
      console.log("Buffer status. Can play: " + canPlay);
      this.$patch((state) => {
        state.playbackBuffer = length;
        state.playbackTimestamp = currentTime;
        if (canPlay && this.playbackState == "buffering") {
          state.playbackState = "paused";
        } else if (!canPlay && this.playbackState == "playing") {
          state.playbackState = "buffering";
        }
      });
      this.announceMediaStatus();
    },
    vJSTimeChange(to: number) {
      this.$patch((state) => {
        state.playbackTimestamp = to;
      });
    },
    vJSBuffering() {
      this.$patch((state) => {
        state.playbackState = "buffering";
      });
      this.announceMediaStatus();
    },
    loadedMediaDetails(
      details: BaseItemDto,
      audioTracks: AudioEntry[],
      subtitleTracks: SubtitleEntry[]
    ) {
      this.$patch((state) => {
        state.mediaDetails = details;
        state.mediaAudioDetails = audioTracks;
        state.mediaSubtitleDetails = subtitleTracks;
      });
    },
    loadedMediaLength(length: number) {
      this.$patch((state) => {
        state.playbackDuration = length;
      });
    },
    vJSPlayState(newState: PlayingState) {
      this.$patch((state) => {
        state.playbackState = newState;
      });
      this.announceMediaStatus();
    },
    togglePlay() {
      if (
        this.serverPlaybackState == "buffering" ||
        this.serverPlaybackState == "playing"
      ) {
        const packet = {
          type: "change-playback-state",
          state: "paused",
          timestamp: this.playbackTimestamp,
        } as any;
        this.socket?.send(JSON.stringify(packet));
      } else {
        const packet = {
          type: "change-playback-state",
          state: "playing",
          timestamp: this.playbackTimestamp,
        } as any;
        this.socket?.send(JSON.stringify(packet));
      }
    },
    seekToSecs(secs: number) {
      const packet = {
        type: "change-playback-state",
        state: this.playbackState == "playing" ? "playing" : "paused",
        timestamp: secs,
      } as any;
      this.socket?.send(JSON.stringify(packet));
    },
    setAudioTrack(index: number) {
      this.$patch((state) => {
        state.playbackAudioTrack = index;
      });
    },
    setSubtitleTrack(index: number) {
      this.$patch((state) => {
        state.playbackSubtitleTrack = index;
      });
    },
    setVolume(percent: number) {
      /*0.0 - 1.0*/
      this.$patch((state) => {
        state.playerVolume = percent;
      });
    },
  },
});

export async function joinRoom(
  room: string,
  displayName: string,
  displayNameColor: string
): Promise<string | SyncSession> {
  const joinRequest = {
    type: "join",
    room,
    displayName,
    displayNameColor
  } as JoinRoomRequest;
  return await connect(joinRequest);
}

export async function createRoom(
  jellyfinHost: string,
  displayName: string,
  displayNameColor: string,
): Promise<string | SyncSession> {
  const createRequest = {
    type: "create",
    jellyfinHost,
    displayName,
    displayNameColor,
  } as CreateRoomRequest;
  return await connect(createRequest);
}

async function connect(initialPayload: any): Promise<string | SyncSession> {
  const syncStore = useSyncStore();
  syncStore.onRoomDisconnect();
  const timeoutPromise = new Promise<boolean>((resolve) =>
    setTimeout(() => {
      resolve(false);
    }, 10000)
  );
  const socket = new WebSocket(websocketUrl);
  const connectPromise = new Promise<boolean>((resolve, _) => {
    const closeHandler = () => {
      resolve(false);
    };
    socket.addEventListener("open", (_) => {
      socket.removeEventListener("close", closeHandler);
      socket.send(JSON.stringify(initialPayload));
      resolve(true);
    });
    socket.addEventListener("close", closeHandler);
  });
  const open = await Promise.race([connectPromise, timeoutPromise]);
  if (!open) {
    console.log("Unsuccessful connection attempt to jellysync server.");
    return "Failed to connect to jellysync server";
  }

  const joinPromise = new Promise<SyncSession | boolean>((resolve, _) => {
    const closeHandler = () => {
      resolve(false);
    };
    const messageHandler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (typeof data.type === "string" && data.type === "session") {
          socket.removeEventListener("message", messageHandler);
          socket.removeEventListener("close", closeHandler);
          resolve(data);
        }
      } catch (err) {
        console.error("Error handling incoming message: '" + event.data + "'");
      }
    };
    socket.addEventListener("message", messageHandler);
    socket.addEventListener("close", closeHandler);
  });

  const session = await Promise.race([joinPromise, timeoutPromise]);
  if (typeof session !== "boolean") {
    console.log("Connected to session");
    const authStore = useAuthStore();
    if (authStore.getServerByAddress(session.jellyfinHost) == undefined) {
      socket.close();
    } else {
      bindToSocket(socket, session);
    }
    return session;
  } else {
    socket.close();
    console.log("Unsuccessful authentication attempt to jellysync server.");
    return "Connection terminated. Perhaps that room doesn't exist?";
  }
}

function bindToSocket(socket: WebSocket, session: SyncSession) {
  const syncStore = useSyncStore();
  syncStore.setSocket(socket);
  syncStore.joinedSession(session);
  socket.addEventListener("close", () => {
    syncStore.onRoomDisconnect();
  });
  socket.addEventListener("message", (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      if (typeof data.type !== "string") {
        throw new Error("Type field missing");
      }
      handleIncomingMessage(data);
    } catch (err) {
      console.error("Error handling incoming message: '" + event.data + "'");
    }
  });
}

function handleIncomingMessage(data: { type: string } & any) {
  const syncStore = useSyncStore();
  switch (data.type) {
    case "member-change":
      const newMembers = data.members as SyncSessionMember[];
      syncStore.updateMembers(newMembers);
      break;
    case "ping":
      syncStore.onReceivedPing();
      syncStore.socket?.send(JSON.stringify({ type: "pong" }));
      break;
    case "member-playback-state":
      syncStore.onReceivedPlaybackState(data as SyncSessionMemberPlaybackState);
      break;
    case "playback-state":
      const state = data.state as PlayingState | undefined;
      if (state == undefined) return;
      syncStore.changeMediaState(
        state,
        typeof data.timestamp === "number" ? data.timestamp : null,
        typeof data.media === "string" ? data.media : null
      );
      break;
    case "chat":
      syncStore.onReceiveChatMessage(data as SyncSessionChatMessage);
      break;
    case "leader-change":
      break;
  }
}
