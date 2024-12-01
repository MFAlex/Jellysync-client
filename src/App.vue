<template>
  <v-app style="overflow: hidden">
    <v-main>
      <div class="d-flex fill-height">
        <div class="flex-grow-1 flex-shrink-1">
          <WelcomeScreen v-if="syncState.session == null" />
          <Lobby
            v-else-if="
              syncState.media == null ||
              (syncState.playbackState == 'nothing-playing' && syncState.serverPlaybackState == 'nothing-playing') ||
              syncState.serverIndex == -1
            "
          />
          <VideoPlayer v-else :video-id="syncState.media" :server-index="syncState.serverIndex" />
        </div>
        <div class="flex-grow-0 flex-shrink-0" v-if="syncState.session != null">
          <Sidebar />
        </div>
      </div>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import WelcomeScreen from "@/components/WelcomeScreen.vue";
import Lobby from "@/components/Lobby.vue";
import VideoPlayer from "@/components/VideoPlayer.vue";
import Sidebar from "@/components/Sidebar.vue";
import { useSyncStore } from "./store/syncState";

const syncState = useSyncStore();
</script>
<style>
html {
  overflow: hidden !important;
}
</style>
