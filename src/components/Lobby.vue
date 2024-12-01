<template>
  <v-sheet
    color="silver"
    style="height: 40px"
    elevation="2"
    class="pa-2 d-flex flex-row align-center"
  >
    <span class="text-h6 flex-grow-1"
      >Nothing playing at the moment</span
    >
  </v-sheet>

  <div class="d-flex flex-row align-center ml-4 mt-4">
    <span class="mr-2">Room ID</span>
    <v-text-field readonly :value="syncStore.session?.room" variant="outlined" hide-details style="font-family: monospace; max-width: 360px;" density="comfortable">
      <template #append-inner>
        <v-btn icon="mdi-content-copy" density="comfortable" variant="plain" @click="copyURL" :color="copyToClipboardStatus == 0 ? 'white' : (copyToClipboardStatus == 1 ? 'success' : 'error')" />
      </template>
    </v-text-field>
  </div>

  <EpisodeSearch v-if="isLeader" />
</template>
<script lang="ts">
import { useAuthStore } from "@/store/authStore";
import { useSyncStore } from "@/store/syncState";
import EpisodeSearch from "@/components/EpisodeSearch.vue";

export default {
  data() {
    return {
      authStore: useAuthStore(),
      syncStore: useSyncStore(),
      mediaHash: "",
      copyToClipboardStatus: 0,
    };
  },
  components: { EpisodeSearch },
  mounted() {
    const justPlayed = this.syncStore.mediaDetails;
    if (justPlayed != null) {
    }
  },
  methods: {
    playMedia(mediaId: string) {
      this.syncStore.leaderChangeMedia(mediaId);
      this.mediaHash = "";
    },
    async copyURL() {
      const room = this.syncStore.session?.room;
      if (room == null) {
        this.copyToClipboardStatus = 2;
        return;
      }
      try {
        await navigator.clipboard.writeText(room);
        this.copyToClipboardStatus = 1;
        setTimeout(() => {
          if (this.copyToClipboardStatus == 1) {
            this.copyToClipboardStatus = 0;
          }
        }, 2000);
      } catch($e) {
        this.copyToClipboardStatus = 2;
      }
    }
  },
  computed: {
    isLeader(): boolean {
      return (
        this.syncStore.session != null &&
        this.syncStore.session.leader == this.syncStore.session.you
      );
    },
  },
};
</script>
