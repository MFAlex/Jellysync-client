import { Api } from "@jellyfin/sdk";
import { defineStore } from "pinia";
import SDK from "@/jellyfin/device-id";
import { AudioPreference, SubtitlePreference } from "@/jellyfin/playback-urls";

export interface ServerCredentials {
  publicAddress: string;
  serverId: string;
  accessToken: string;
  userId: string;
  userName: string;
  guestKey?: string;
  guestUserId?: string;
}

export interface GuestCredentials {
  accessToken: string;
  publicAddress: string;
  userId: string;
}

export function isServerCredentials(data: any): data is ServerCredentials {
  return data != null && typeof data === "object" && typeof data["publicAddress"] === "string" && typeof data["userName"] === "string" &&
    typeof data["accessToken"] === "string";
}

export const useAuthStore = defineStore("auth", {
  state: () => ({
    displayName: loadDisplayName(),
    displayNameColor: loadDisplayNameColor(),
    servers: loadServers(),
    apiSessions: {} as Record<string, Api>, //public address -> Api
    audioPreference: loadAudioPreference(),
    subsPreference: loadSubsPreference(),
    sidebarPinned: loadSidebarPreference(),
  }),
  getters: {
    getApiSessionFromPublicAddress: (state) => {
      return (publicAddress: string): Api | undefined => {
        const existingApi = state.apiSessions[publicAddress];
        if (existingApi != undefined) {
          return existingApi;
        } else {
          const server = state.servers.find(
            (it) => it.publicAddress == publicAddress
          );
          if (server != undefined) {
            const api = createApi(server);
            state.apiSessions[publicAddress] = api;
            return api;
          } else {
            return undefined;
          }
        }
      };
    },
    getServerByIndex: (state) => {
      return (index: number): ServerCredentials | GuestCredentials | undefined => {
        return state.servers[index];
      };
    },
    getServerByAddress: (state) => {
      return (address: string): ServerCredentials | GuestCredentials | undefined => {
        return state.servers.find((it) => it.publicAddress == address);
      };
    },
    serverAddresses: (state): string[] => {
      return state.servers.map(it => it.publicAddress);
    },
    getIndexByAddress: (state) => {
      return (address: string): number => {
        return state.servers.findIndex((it) => it.publicAddress == address);
      };
    },
    getNonGuestServers: (state) => {
      return (): ServerCredentials[] => {
        return state.servers.filter(it => isServerCredentials(it))
      }
    }
  },
  actions: {
    addServer(credentials: ServerCredentials) {
      this.removeServer(credentials);
      this.servers.push(credentials);
      saveServers(this.servers);
    },
    addGuestAccess(hostname: string, guestKey: string, guestUserId: string) {
      const server = this.getServerByAddress(hostname);
      if (isServerCredentials(server)) {
        server.guestKey = guestKey;
        server.guestUserId = guestUserId;
        saveServers(this.servers);
      }
    },
    removeServer(credentials: GuestCredentials) {
      this.removeServerByAddress(credentials.publicAddress);
    },
    removeServerByAddress(address: string) {
      this.servers = this.servers.filter(it => it.publicAddress != address);
      saveServers(this.servers);
    },
    setDisplayName(to: string) {
      const it = to === "" ? null : to;
      this.displayName = it;
      saveDisplayName(it);
    },
    setDisplayNameColor(to: string) {
      const it = to === "" ? null : to;
      this.displayNameColor = it;
      saveDisplayNameColor(it);
    },
    setTrackPreferences(audioPreference: AudioPreference, subsPreference: SubtitlePreference) {
      this.$patch((state) => {
        state.audioPreference = audioPreference;
        state.subsPreference = subsPreference;
      });
      saveTrackPreferences(audioPreference, subsPreference);
    },
    setSidebarPreference(isPinned: boolean) {
      this.$patch((state) => {
        state.sidebarPinned = isPinned;
      });
      saveSidebarPreference(isPinned);
    },
    consumingGuestAccesss(host: string, key: string, userId: string) {
      this.$patch((state) => {
        const guestCredentials = {
          accessToken: key,
          publicAddress: host,
          userId
        } as GuestCredentials;
        this.removeServer(guestCredentials);
        state.servers.push(guestCredentials);
      });
    }
  },
});

function createApi(credentials: ServerCredentials | GuestCredentials): Api {
  return SDK.createApi(
    credentials.publicAddress,
    credentials.accessToken
  );
}

function loadServers(): (ServerCredentials | GuestCredentials)[] {
  const settings = localStorage.getItem("jellysync_servers");
  return settings ? JSON.parse(settings) : [];
}

function loadDisplayName(): string | null {
  const name = localStorage.getItem("jellysync_displayName");
  return name;
}

function saveDisplayName(name: string | null) {
  if (name == null) {
    localStorage.removeItem("jellysync_displayName");
  } else {
    localStorage.setItem("jellysync_displayName", name);
  }
}

function loadDisplayNameColor(): string | null {
  const color = localStorage.getItem("jellysync_displayNameColor");
  return color;
}

function saveDisplayNameColor(color: string | null) {
  if (color == null) {
    localStorage.removeItem("jellysync_displayNameColor");
  } else {
    localStorage.setItem("jellysync_displayNameColor", color);
  }
}

function saveServers(servers: (ServerCredentials | GuestCredentials)[]) {
  const toKeep = servers.filter(it => isServerCredentials(it));
  localStorage.setItem("jellysync_servers", JSON.stringify(toKeep));
}

function saveTrackPreferences(audioPreference: AudioPreference, subsPreference: SubtitlePreference) {
  localStorage.setItem("jellysync_preferences", JSON.stringify({audioPreference, subsPreference}));
}

function loadAudioPreference(): AudioPreference {
  const it = localStorage.getItem("jellysync_preferences");
  const prefs = it ? JSON.parse(it) : null;
  if (prefs != null) {
    return prefs.audioPreference as AudioPreference;
  } else {
    return "english";
  }
}

function loadSubsPreference(): SubtitlePreference {
  const it = localStorage.getItem("jellysync_preferences");
  const prefs = it ? JSON.parse(it) : null;
  if (prefs != null) {
    return prefs.subsPreference as SubtitlePreference;
  } else {
    return "full";
  }
}

function loadSidebarPreference(): boolean | null {
  const name = localStorage.getItem("jellysync_sidebarPreference") ?? "pinned";
  return name === "pinned";
}

function saveSidebarPreference(pinned: boolean) {
  localStorage.setItem("jellysync_sidebarPreference", pinned ? "pinned" : "floating");
}
