<template>
  <v-container fluid class="fill-height" id="welcome-screen-root">
    <div class="d-flex" style="position: absolute; top: 48px; left: 72px">
      <v-img src="/jellysync-logo-white.png" width="84" height="84" class="mr-4" />
      <div class="text-h1"><b style="font-weight: 450">Jelly</b>Sync</div>
    </div>
    <div style="position: absolute; top: 192px; left: 72px">
      <div v-if="authStore.displayName != null && authStore.servers.length > 0" class="welcome">
        Welcome back, {{ authStore.displayName }}
      </div>
      <div v-else class="welcome">
        Welcome. Please visit the settings menu before continuing
      </div>
      <v-dialog max-width="500" persistent no-click-animation>
        <template v-slot:activator="{ props: activatorProps }">
          <v-btn class="glass-button mb-2" size="x-large" v-bind="activatorProps" :disabled="authStore.displayName == null || authStore.servers.length == 0
            ">Create room</v-btn>
        </template>

        <template v-slot:default="{ isActive }">
          <v-card>
            <v-toolbar title="Choose a server" color="primary">
              <template v-slot:prepend>
                <v-btn icon="mdi-arrow-left" @click="
                  creatingRoomError = null;
                isActive.value = false;
                "></v-btn>
              </template>
            </v-toolbar>
            <v-list lines="two" density="comfortable">
              <v-list-item v-for="server in authStore.servers" :key="server.publicAddress" :value="server" color="white"
                @click="createRoomVue(server.publicAddress)">
                <template v-slot:prepend>
                  <v-icon icon="mdi-server-network" v-if="server.publicAddress != creatingRoomFor"></v-icon>
                  <v-progress-circular color="white" indeterminate v-else></v-progress-circular>
                </template>

                <v-list-item-title v-text="server.publicAddress" />
                <v-list-item-subtitle v-text="server.userName" />
              </v-list-item>
            </v-list>
            <v-alert density="compact" :text="creatingRoomError" v-if="creatingRoomError != null" title="Error"
              type="error"></v-alert>
            <span class="text-caption pa-4">Other people are required to have an account on this server to
              join the room</span>
          </v-card>
        </template>
      </v-dialog>
      <br />
      <v-dialog max-width="500" persistent no-click-animation>
        <template v-slot:activator="{ props: activatorProps }">
          <v-btn class="glass-button mb-2" size="x-large" v-bind="activatorProps" :disabled="authStore.displayName == null || authStore.servers.length == 0
            ">Join room</v-btn>
        </template>

        <template v-slot:default="{ isActive }">
          <v-card>
            <v-toolbar title="Enter room code" color="primary">
              <template v-slot:prepend>
                <v-btn icon="mdi-arrow-left" @click="
                  joiningRoomError = null;
                roomCode = '';
                isActive.value = false;
                "></v-btn>
              </template>
            </v-toolbar>
            <v-text-field placeholder="Room code" variant="underlined" :error-messages="joiningRoomError"
              :loading="joiningRoom" append-inner-icon="mdi-arrow-right" @click:append-inner="joinRoomVue(roomCode)"
              v-model="roomCode" class="pa-6" @keyup.enter="joinRoomVue(roomCode)" />
          </v-card>
        </template>
      </v-dialog>
      <br />
      <v-dialog max-width="600" persistent no-click-animation>
        <template v-slot:activator="{ props: activatorProps }">
          <v-btn class="glass-button mb-2" size="x-large" v-bind="activatorProps">Settings</v-btn>
        </template>

        <template v-slot:default="{ isActive }">
          <v-card>
            <v-toolbar title="Settings" color="primary">
              <template v-slot:prepend>
                <v-btn icon="mdi-arrow-left" @click="
                  addingServer = false;
                loginFormServerAddress = '';
                loginFormUsername = '';
                loginFormPassword = '';
                loginError = null;
                isActive.value = false;
                "></v-btn>
              </template>
            </v-toolbar>
            <v-card-text>
              <span class="ml-4 text-h6 mt-2">Display name</span>
              <v-text-field label="Display name" variant="outlined" v-model="displayName" class="pa-4 pb-0" />

              <span class="ml-4 text-h6 mt-2">Display name color</span>
              <v-color-picker v-model="displayNameColor" class="pa-4 pb-0" />

              <p class="ml-4 text-h6 mt-2">Language</p>
              <span class="ml-4">Audio:</span>
              <v-radio-group class="ml-4" v-model="audioPreference">
                <v-radio label="Prefer english audio" value="english" />
                <v-radio label="Prefer foreign audio" value="foreign" />
              </v-radio-group>
              <span class="ml-4">Subtitles:</span>
              <v-radio-group class="ml-4" v-model="subsPreference">
                <v-radio label="No subtitles" value="off" />
                <v-radio label="Prefer Signs & Songs" value="signs" />
                <v-radio label="Prefer full subtitles when audio is not in english" value="full" />
                <v-radio label="Always prefer full subtitles" value="always-full" />
              </v-radio-group>

              <span class="ml-4 text-h6">Jellyfin servers</span>
              <v-list lines="two" density="comfortable">
                <v-list-item v-for="server in authStore.servers" :key="server.publicAddress" :value="server"
                  color="white">
                  <template v-slot:prepend>
                    <v-icon icon="mdi-server-network"></v-icon>
                  </template>
                  <template v-slot:append>
                    <v-btn icon="mdi-delete" variant="plain" color="red" @click="logoutServer(server)" />
                  </template>

                  <v-list-item-title v-text="server.publicAddress" />
                  <v-list-item-subtitle v-text="server.userName" />
                </v-list-item>
                <v-expansion-panels elevation="0">
                  <v-expansion-panel>
                    <template v-slot:title>
                      <span class="ml-12">
                        {{
                          authStore.servers.length == 0
                            ? "Add server"
                            : "Add another server"
                        }}
                      </span>
                    </template>
                    <template v-slot:text>
                      <v-form v-model="loginFormValid" @submit.prevent="addJellyfinServer" class="ml-12">
                        <v-text-field v-model="loginFormServerAddress" autofocus variant="underlined"
                          density="comfortable" hide-details="auto"
                          placeholder="Server address (e.g. https://jellyfin.example.org)" required></v-text-field>
                        <v-text-field v-model="loginFormUsername" variant="underlined" density="comfortable"
                          hide-details="auto" placeholder="Username" required></v-text-field>
                        <v-text-field v-model="loginFormPassword" variant="underlined" density="comfortable"
                          hide-details="auto" placeholder="Password" type="password" required></v-text-field>
                        <v-btn class="mt-2" type="submit" variant="outlined" color="secondary"
                          :loading="loadingLoginForm">Login</v-btn>
                      </v-form>
                      <span v-if="loginError != null" class="text-red ml-12">{{
                        loginError
                      }}</span>
                    </template>
                  </v-expansion-panel>
                </v-expansion-panels>
              </v-list>
            </v-card-text>
          </v-card>
        </template>
      </v-dialog>
    </div>
  </v-container>
</template>

<script lang="ts">
import { authenticateWithServer, logoutOfServer } from "@/jellyfin/auth-api";
import { AudioPreference, SubtitlePreference } from "@/jellyfin/playback-urls";
import { ServerCredentials, useAuthStore } from "@/store/authStore";
import { createRoom, joinRoom, useSyncStore } from "@/store/syncState";

export default {
  data() {
    return {
      loginFormValid: false,
      loginFormServerAddress: "",
      loginFormUsername: "",
      loginFormPassword: "",
      loadingLoginForm: false,
      loginError: null as null | string,
      authStore: useAuthStore(),
      syncStore: useSyncStore(),
      creatingRoomFor: null as null | string,
      creatingRoomError: null as null | string,
      joiningRoomError: null as null | string,
      joiningRoom: false,
      roomCode: "",
      addingServer: false,
    };
  },
  methods: {
    async addJellyfinServer() {
      this.loadingLoginForm = true;
      this.loginError = null;
      const address = this.loginFormServerAddress;
      const username = this.loginFormUsername;
      const password = this.loginFormPassword;
      const result = (await authenticateWithServer(
        address,
        username,
        password
      )) as any;
      this.loadingLoginForm = false;
      if (result.reason != undefined) {
        this.loginError = result.reason;
        console.error((result as any).reason);
      } else if (result == null || result.publicAddress == null) {
        this.loginError = "Failed to login";
      } else {
        const details = result as ServerCredentials;
        this.authStore.addServer(details);
        this.loginFormServerAddress = "";
        this.loginFormUsername = "";
        this.loginFormPassword = "";
        this.addingServer = false;
      }
    },
    async createRoomVue(server: string) {
      if (this.authStore.displayName != null) {
        // default to purple
        if (this.authStore.displayNameColor == null) {
          this.authStore.displayNameColor = "purple";
        }
        this.creatingRoomFor = server;
        const result = await createRoom(server, this.authStore.displayName, this.authStore.displayNameColor);
        this.creatingRoomFor = null;
        if (typeof result === "string") {
          this.creatingRoomError = result;
        }
      }
    },
    async joinRoomVue(code: string) {
      if (this.authStore.displayName != null) {
        // default to purple
        if (this.authStore.displayNameColor == null) {
          this.authStore.displayNameColor = "purple";
        }
        this.joiningRoom = true;
        const result = await joinRoom(code, this.authStore.displayName, this.authStore.displayNameColor);
        this.joiningRoom = false;
        if (typeof result === "string") {
          this.joiningRoomError = result;
        } else {
          const server = this.authStore.getServerByAddress(result.jellyfinHost);
          if (server == undefined) {
            console.log("Leaving because the required jellyfin server was not found");
            this.joiningRoomError =
              "That room requires an account on " +
              result.jellyfinHost +
              ", which you do not have";
          }
        }
      }
    },
    logoutServer(server: ServerCredentials) {
      logoutOfServer(server);
      this.authStore.removeServer(server);
    }
  },
  computed: {
    displayName: {
      get() {
        return this.authStore.displayName;
      },
      set(val: string) {
        this.authStore.setDisplayName(val);
      },
    },
    displayNameColor: {
      get() {
        return this.authStore.displayNameColor;
      },
      set(val: string) {
        this.authStore.setDisplayNameColor(val);
      },
    },
    audioPreference: {
      get() {
        return this.authStore.audioPreference;
      },
      set(val: AudioPreference) {
        this.authStore.setTrackPreferences(val, this.authStore.subsPreference);
      },
    },
    subsPreference: {
      get() {
        return this.authStore.subsPreference;
      },
      set(val: SubtitlePreference) {
        this.authStore.setTrackPreferences(this.authStore.audioPreference, val);
      },
    },
  },
};
</script>
<style scoped>
#welcome-screen-root {
  background: rgb(165, 94, 196);
  background: linear-gradient(115deg,
      rgba(165, 94, 196, 0.3) 0%,
      rgba(2, 163, 220, 0.8) 100%),
    url(data:image/png;base64,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);
  background-repeat: repeat;
}

.glass-button {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  box-shadow: 0 4px 30px rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.5);
  padding: 24px;
  height: 96px !important;
  font-size: 24px;
  color: rgba(255, 255, 255, 0.7);
  transition: box-shadow 0.3s, color 0.6s;
}

.glass-button:hover {
  box-shadow: 0 4px 30px rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 1);
}

.welcome {
  font-size: 24px;
  margin-bottom: 16px;
}
</style>
