<template>
  <div class="d-flex flex-row ma-4">
    <v-card class="flex-grow-1 overflowable">
      <v-text-field
        placeholder="Search for media"
        v-model="currentSearch"
        variant="solo"
        elevation="0"
        tile
        clearable
        hide-details
        @click:clear="
          lastSearch = '';
          currentSearch = '';
          searchResultsT1 = null;
          searchResultsT2 = null;
          searchResultsT3 = null;
          currentT2 = null;
          currentT3 = null;
        "
      />
      <v-list lines="two">
        <v-list-item
          v-for="item of searchResultsT1"
          :key="item.Id"
          :title="
            item.Name +
            (item.ProductionYear != null
              ? ' (' + item.ProductionYear + ')'
              : '')
          "
          :subtitle="'Type: ' + item.Type"
          @click="item.Type === 'Movie' ? play(item.Id) : searchT2(item)"
          :class="item.Id === currentT2?.Id ? 'text-primary' : ''"
        />
      </v-list>
    </v-card>
    <v-card v-if="searchResultsT2 != null" class="ml-2 flex-grow-1 overflowable">
      <v-card-title>{{ currentT2?.Name }}</v-card-title>
      <v-list lines="one">
        <v-list-item
          v-for="item of searchResultsT2"
          :key="item.Id"
          :title="
            item.Name +
            (item.ProductionYear != null
              ? ' (' + item.ProductionYear + ')'
              : '')
          "
          @click="searchT3(item)"
          :class="item.Id === currentT3?.Id ? 'text-primary' : ''"
        />
      </v-list>
    </v-card>
    <v-card v-if="searchResultsT3 != null" class="ml-2 flex-grow-1 overflowable">
      <v-card-title>{{ currentT3?.Name }}</v-card-title>
      <v-list lines="two">
        <v-list-item
          v-for="item of searchResultsT3"
          :key="item.Id"
          :title="
            item.Name +
            (item.ProductionYear != null
              ? ' (' + item.ProductionYear + ')'
              : '')
          "
          :subtitle="item.SeasonName + ' Episode ' + item.IndexNumber"
          @click="play(item.Id)"
          :color="item.Id === currentT3?.Id ? 'primary' : 'white'"
        />
      </v-list>
    </v-card>
  </div>
</template>
<script lang="ts">
import { ServerCredentials, useAuthStore } from "@/store/authStore";
import { useSyncStore } from "@/store/syncState";
import {
  EpisodeMetadataEntry,
  getEpisodes,
  getSeasons,
  isDisplayableMedia,
  isEpisode,
  isSeason,
  searchAll,
  SeasonMetadataEntry,
  VideoMetadataEntry,
} from "@/jellyfin/library-lookup";

export default {
  data() {
    return {
      authStore: useAuthStore(),
      syncStore: useSyncStore(),
      searchResultsT1: null as null | VideoMetadataEntry[],
      searchResultsT2: null as null | SeasonMetadataEntry[],
      searchResultsT3: null as null | EpisodeMetadataEntry[],

      currentT2: null as null | VideoMetadataEntry,
      currentT3: null as null | SeasonMetadataEntry,

      lastSearch: "",
      currentSearch: "",
      isSearching: false,
    };
  },
  methods: {
    async search(term: string) {
      if (this.server == null) return;
      this.isSearching = true;
      this.searchResultsT2 = null;
      this.searchResultsT3 = null;

      if (term == null || term.length < 3) {
        this.lastSearch = term;
        this.isSearching = false;
        this.searchResultsT1 = [];
        return;
      }

      const results = await searchAll(term, this.server);
      if (results == undefined) {
        this.isSearching = false;
      } else {
        const resultsModel = results.filter((it) => isDisplayableMedia(it));
        this.searchResultsT1 = resultsModel;
        this.isSearching = false;
        this.lastSearch = term;
        if (this.currentSearch != this.lastSearch) {
          this.search(this.currentSearch);
        }
      }
    },
    async searchT2(show: VideoMetadataEntry) {
      if (this.server == null) return;
      this.currentT2 = show;
      this.searchResultsT3 = null;

      const results = await getSeasons(show, this.server);
      if (results == undefined) {
        this.searchResultsT2 = [];
      } else {
        const resultsModel = results.filter((it) => isSeason(it));
        this.searchResultsT2 = resultsModel;
      }
    },
    async searchT3(season: SeasonMetadataEntry) {
      if (this.server == null) return;
      this.currentT3 = season;
      this.searchResultsT3 = null;

      const results = await getEpisodes(season, this.server);
      if (results == undefined) {
        this.searchResultsT3 = null;
      } else {
        const resultsModel = results.filter((it) => isEpisode(it));
        this.searchResultsT3 = resultsModel;
      }
    },
    play(mediaId: string) {
      this.syncStore.leaderChangeMedia(mediaId);
    },
  },
  computed: {
    server(): null | ServerCredentials {
      const index = this.syncStore.serverIndex;
      if (index >= 0) {
        return this.authStore.getServerByIndex(index) ?? null;
      } else {
        return null;
      }
    },
  },
  watch: {
    currentSearch(newVal) {
      if (newVal != this.lastSearch && !this.isSearching) {
        this.search(newVal);
      }
    },
  },
};
</script>
<style scoped>
.overflowable {
  overflow-y: auto;
  max-height: calc(100vh - 136px);
}
</style>
