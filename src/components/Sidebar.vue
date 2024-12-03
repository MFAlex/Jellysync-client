<template>
  <div class="sidebar sidebar-docked d-flex flex-column" v-if="pinned">
    <v-sheet color="primary" style="height: 40px" elevation="2" class="pa-2 d-flex flex-row align-center">
      <v-img src="/jellysync-logo-white.png" width="24" height="24" class="mr-1 flex-grow-0" />
      <span class="text-h6 flex-grow-1"><b>Jelly</b>Sync</span>
      <v-tooltip text="Undock sidebar">
        <template v-slot:activator="{ props }">
          <v-btn icon="mdi-pin-off-outline" density="comfortable" variant="text" v-bind="props" @click="
            pinned = false;
          showingDock = true;
          " />
        </template>
      </v-tooltip>
    </v-sheet>
    <div class="sidebar-heading">USERS</div>
    <div>
      <v-expand-transition group>
        <div v-for="user in syncStore.session?.members" :key="user.index" class="user d-flex flex-row align-center">
          <div class="mr-1">
            <v-icon size="x-large" v-if="playbackStatus(user.index) == 'unknown'">mdi-help-rhombus</v-icon>
            <v-progress-circular v-else-if="playbackStatus(user.index) == 'buffering'" indeterminate />
            <v-icon size="x-large" v-else-if="playbackStatus(user.index) == 'playing'">mdi-play</v-icon>
            <v-icon size="x-large" v-else-if="playbackStatus(user.index) == 'paused'">mdi-pause</v-icon>
            <v-icon size="x-large" v-else>mdi-stop</v-icon>
          </div>
          <div class="d-flex flex-column">
            <div>
              <b class="mr-1">{{ user.displayName }}</b>

              <v-tooltip text="Room leader" v-if="user.index == syncStore.session?.leader" location="top" offset="0">
                <template v-slot:activator="{ props }">
                  <v-icon v-bind="props" icon="mdi-crown" size="small" style="cursor: pointer" />
                </template>
              </v-tooltip>
            </div>
            <div>
              <span v-if="playbackStatus(user.index) == 'nothing-playing'">Nothing playing</span>
              <code v-else-if="playbackTimestamp(user.index) != null">{{
                playbackTimestamp(user.index)
              }}</code>
              <span v-else>Unknown playback status</span>
            </div>
          </div>
        </div>
      </v-expand-transition>
    </div>
    <v-divider></v-divider>
    <div class="sidebar-heading">CHAT</div>
    <div class="flex-grow-1 ml-2 chat-box justify-start flex-shrink-1">
      <ul>
        <li v-for="(message, index) in syncStore.chat" :key="index"
          :class="message.member === 'system' ? 'chat-msg-system' : 'chat-msg'">
          <span style="color: lightgray; margin-right: 5px; font-size:x-small;">{{ message.time.getHours() }}:{{
            message.time.getMinutes() }}</span>
          <span :style="findDisplayNameColor(message.member)" v-if="message.member !== 'system'" class="chat-msg-sender">{{
            message.member
          }} </span>{{ message.message }}
        </li>
      </ul>
    </div>
    <div>
      <v-textarea placeholder="Message" hide-details variant="solo" flat auto-grow no-resize rounded="0" rows="1"
        density="comfortable" @keydown.enter="sendChat" v-model="chatMessage" />
    </div>
  </div>

  <!--

  ******************************
  MARK BEGINNING OF UNDOCKED
  ******************************

  -->

  <div class="sidebar sidebar-undocked d-flex flex-column" v-else>
    <div style="height: 40px">
      <v-slide-x-reverse-transition>
        <div style="height: 40px"
          :class="'pa-2 d-flex flex-row align-center fade-in-bg' + (showingDock ? ' floating-bg' : '')"
          v-if="showingDock">
          <v-img src="/jellysync-logo-white.png" width="24" height="24" class="mr-1 flex-grow-0" />
          <span class="text-h6 flex-grow-1"><b>Jelly</b>Sync</span>
          <v-tooltip text="Dock sidebar to right">
            <template v-slot:activator="{ props }">
              <v-btn icon="mdi-pin-outline" density="comfortable" variant="text" v-bind="props"
                @click="pinned = true" />
            </template>
          </v-tooltip>
        </div>
      </v-slide-x-reverse-transition>
    </div>
    <div v-for="user in syncStore.session?.members" :key="user.index">
      <v-slide-x-reverse-transition>
        <div v-if="playbackStatus(user.index) !== 'playing' || showingDock"
          class="user d-flex flex-row align-center floating-user">
          <div class="mr-1">
            <v-icon size="x-large" v-if="playbackStatus(user.index) == 'unknown'">mdi-help-rhombus</v-icon>
            <v-progress-circular v-else-if="playbackStatus(user.index) == 'buffering'" indeterminate />
            <v-icon size="x-large" v-else-if="playbackStatus(user.index) == 'playing'">mdi-play</v-icon>
            <v-icon size="x-large" v-else-if="playbackStatus(user.index) == 'paused'">mdi-pause</v-icon>
            <v-icon size="x-large" v-else>mdi-stop</v-icon>
          </div>
          <div class="d-flex flex-column">
            <div>
              <b class="mr-1">{{ user.displayName }}</b>

              <v-tooltip text="Room leader" v-if="user.index == syncStore.session?.leader" location="top" offset="0">
                <template v-slot:activator="{ props }">
                  <v-icon v-bind="props" icon="mdi-crown" size="small" style="cursor: pointer" />
                </template>
              </v-tooltip>
            </div>
            <div>
              <span v-if="playbackStatus(user.index) == 'nothing-playing'">Nothing playing</span>
              <code v-else-if="playbackTimestamp(user.index) != null">{{
                playbackTimestamp(user.index)
              }}</code>
              <span v-else>Unknown playback status</span>
            </div>
          </div>
        </div>
      </v-slide-x-reverse-transition>
    </div>
    <div class="flex-grow-1 ml-2 chat-box justify-start flex-shrink-1">
      <ul>
        <li v-for="(message, index) in syncStore.chat" :key="index"
          :class="message.member === 'system' ? 'chat-msg-system' : 'chat-msg'">
          <span style="color: lightgray; margin-right: 5px; font-size:x-small;">{{ message.time.getHours() }}:{{
            message.time.getMinutes() }}</span>
          <span :style="findDisplayNameColor(message.member)" v-if="message.member !== 'system'" class="chat-msg-sender">{{
            message.member
          }} </span>{{ message.message }}
        </li>
      </ul>
    </div>
    <div style="min-height: 64px;" :class="'pa-1 pt-2 fade-in-bg' + (showingDock ? ' floating-bg' : '')">
      <v-slide-x-reverse-transition>
        <v-textarea style="min-height: 48px" placeholder="Message" hide-details variant="outlined" flat auto-grow
          no-resize class="mr-1" rows="1" density="comfortable" @keydown.enter="sendChat" v-model="chatMessage"
          id="docked-chat-box" v-show="showingDock" />
      </v-slide-x-reverse-transition>
    </div>
  </div>
</template>
<script lang="ts">
import { useAuthStore } from "@/store/authStore";
import { useSyncStore } from "@/store/syncState";
import { nextTick } from "process";

export default {
  data() {
    return {
      authStore: useAuthStore(),
      syncStore: useSyncStore(),
      chatMessage: "",
      showingDock: false,
    };
  },
  methods: {
    playbackStatus(
      index: number
    ): "unknown" | "playing" | "paused" | "buffering" | "nothing-playing" {
      if (index === this.syncStore.session?.you) {
        return this.syncStore.playbackState;
      } else {
        return (
          this.syncStore.getPlaybackStateByIndex(index)?.state ?? "unknown"
        );
      }
    },
    playbackTimestamp(index: number): string | null {
      let timestamp =
        this.syncStore.getPlaybackStateByIndex(index)?.timestamp ?? null;
      let buffered =
        this.syncStore.getPlaybackStateByIndex(index)?.bufferSecs ?? null;
      if (index === this.syncStore.session?.you) {
        timestamp = this.syncStore.playbackTimestamp;
        buffered = this.syncStore.playbackBuffer;
      }

      if (timestamp === null) {
        return null;
      } else {
        let hours = Math.floor(timestamp / 3600);
        timestamp %= 3600;
        let minutes = Math.floor(timestamp / 60);
        let seconds = Math.floor(timestamp % 60);

        let hoursS = String(hours).padStart(2, "0");
        let minutesS = String(minutes).padStart(2, "0");
        let secondsS = String(seconds).padStart(2, "0");
        let time = hoursS + ":" + minutesS + ":" + secondsS;
        if (buffered != null) {
          time += " (" + Math.floor(buffered) + "s buffered)";
        }
        return time;
      }
    },
    sendChat(event: KeyboardEvent) {
      if (event.shiftKey) return;
      event.preventDefault();
      if (this.chatMessage.trim().length == 0) return;
      this.syncStore.sendChatMessage(this.chatMessage);
      this.chatMessage = "";
    },
    findDisplayNameColor(member: string) {
      return {color: this.syncStore.session?.members.find((it) => it.displayName == member)?.displayNameColor};
    },
    toggleSidebar(event: KeyboardEvent) {
      if (this.pinned) return;
      if (event.key == "Enter") {
        this.showingDock = !this.showingDock;
        if (this.showingDock) {
          event.preventDefault();
          nextTick(() => {
            const element = document.getElementById("docked-chat-box");
            element?.focus();
          });
        }
      } else if (event.key == "Escape") {
        event.preventDefault();
        this.showingDock = false;
      }
    },
  },
  computed: {
    isInRoom() {
      return this.syncStore.session != null;
    },
    pinned: {
      get() {
        return (
          this.authStore.sidebarPinned ||
          this.syncStore.playbackState == "nothing-playing"
        );
      },
      set(val: boolean) {
        this.authStore.setSidebarPreference(val);
      },
    },
  },
  mounted() {
    document.addEventListener("keydown", this.toggleSidebar);
  },
  unmounted() {
    document.removeEventListener("keydown", this.toggleSidebar);
  },
};
</script>
<style scoped>
.sidebar-heading {
  height: 20px;
  font-weight: 500;
  font-size: 14px;
  padding-left: 8px;
  padding-top: 2px;
}

.sidebar-docked {
  width: 360px;
  height: 100vh;
  background: linear-gradient(60deg,
      rgba(165, 94, 196, 1) 0%,
      rgba(2, 163, 220, 1) 100%);
}

.sidebar-undocked {
  position: fixed;
  right: 0;
  top: 0;
  width: 360px;
  height: calc(100vh - 64px);
  background: none;
  z-index: 32;
}

.floating-bg {
  background: rgba(0, 0, 0, 0.25);
}

.fade-in-bg {
  transition: background-color 0.3s;
}

.floating-chat {
  text-shadow: 0px 0px 5px black, 0px 0px 5px black;
  padding-left: 5px;
}

.floating-user {
  background: rgba(0, 0, 0, 0.25);
  padding: 6px;
}

.user {
  height: 48px;
  padding-left: 8px;
}

.chat-msg-system {
  font-style: italic;
  color: rgba(255, 255, 255, 0.6);
}

.chat-msg {
  color: rgba(255, 255, 255, 0.9);
}

.chat-msg-sender {
  font-weight: bold;
  padding-right: 12px
}

.chat-box {
  overflow-y: scroll;
  display: flex;
  flex-direction: column-reverse;
}

/* width */
::-webkit-scrollbar {
  width: 15px;
}

/* Track */
::-webkit-scrollbar-track {
  box-shadow: inset 0 0 5px grey;
  border-radius: 10px;
}

/* Handle */
::-webkit-scrollbar-thumb {
  background: #643EB6;
  border-radius: 10px;
}

/* Handle on hover */
::-webkit-scrollbar-thumb:hover {
  background: #740183;
}
</style>
