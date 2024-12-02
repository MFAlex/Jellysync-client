<template>
  <v-sheet color="silver" style="height: 40px" elevation="2" class="pa-2 d-flex flex-row align-center">
    <span class="text-h6 flex-grow-1">Nothing playing at the moment</span>
  </v-sheet>

  <div class="d-flex flex-row align-center ml-4 mt-4">
    <span class="mr-2">Room ID</span>
    <v-text-field readonly :value="syncStore.session?.room" variant="outlined" hide-details
      style="font-family: monospace; max-width: 360px;" density="comfortable">
      <template #append-inner>
        <v-btn icon="mdi-content-copy" density="comfortable" variant="plain" @click="copyURL"
          :color="copyToClipboardStatus == 0 ? 'white' : (copyToClipboardStatus == 1 ? 'success' : 'error')" />
      </template>
    </v-text-field>
  </div>

  <EpisodeSearch v-if="isLeader" />
  <div class="next-ep-section" v-if="isLeader && lastPlayed && nextEpisode">
    <div style="flex-direction: column; display: flex; justify-content: center; align-items: center;">
      Just finished {{ lastPlayed.SeriesName }} {{ lastPlayed.SeasonName }} Episode {{ lastPlayed.IndexNumber }}. Play
      next episode?
      <v-btn color="primary" append-icon="mdi-arrow-right-thick" style="margin-top: 15px"
        @click="playNextEp(lastPlayed)">
        {{ nextEpisode.SeriesName }} {{ nextEpisode.SeasonName }} Episode {{ nextEpisode.IndexNumber }}
      </v-btn>
    </div>
  </div>
</template>
<script lang="ts">
import { ServerCredentials, useAuthStore } from "@/store/authStore";
import { useSyncStore } from "@/store/syncState";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import EpisodeSearch from "@/components/EpisodeSearch.vue";
import { getNextEpisode } from "@/jellyfin/library-lookup";

export default {
  data() {
    return {
      authStore: useAuthStore(),
      syncStore: useSyncStore(),
      mediaHash: "",
      copyToClipboardStatus: 0,
      nextEpisode: undefined as BaseItemDto | undefined
    };
  },
  components: { EpisodeSearch },
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
      } catch ($e) {
        this.copyToClipboardStatus = 2;
      }
    },
    async playNextEp(lastPlayed: BaseItemDto) {
      if (this.server == null) return;
      const nextEpisode = await getNextEpisode(lastPlayed, this.server);
      if (nextEpisode?.Id) {
        this.syncStore.leaderChangeMedia(nextEpisode.Id);
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
    lastPlayed(): BaseItemDto | null {
      if (this.syncStore.lastPlayed && this.server != null) {
        getNextEpisode(this.syncStore.lastPlayed, this.server).then((response) => {
          if (response) {
            this.nextEpisode = response;
          }
        })
      }
      return this.syncStore.lastPlayed;
    },
    server(): null | ServerCredentials {
      const index = this.syncStore.serverIndex;
      if (index >= 0) {
        return this.authStore.getServerByIndex(index) ?? null;
      } else {
        return null;
      }
    },
  },
};
</script>
<style scoped>
.next-ep-section {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 70%;
}
</style>
