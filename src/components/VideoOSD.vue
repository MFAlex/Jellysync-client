<template>
  <div id="video-osd" @mousemove="showOsd()">
    <div id="video-osd-relative-container">
      <div id="video-osd-top-shadow" />
      <div id="video-osd-top">
        <div class="d-flex flex-row align-center">
          <v-tooltip
            text="Return everyone to lobby"
            location="bottom"
            offset="5"
          >
            <template v-slot:activator="{ props }">
              <v-btn
                icon="mdi-keyboard-return"
                density="comfortable"
                size="x-large"
                variant="text"
                @click="syncStore.stopPlayback()"
                class="mr-3"
                v-bind="props"
              />
            </template>
          </v-tooltip>

          <div>
            {{ syncStore.mediaDetails?.Name ?? "Unknown video title" }}
            <div
              v-if="
                syncStore.mediaDetails?.SeriesName != null &&
                syncStore.mediaDetails?.SeasonName != null &&
                syncStore.mediaDetails?.IndexNumber != null
              "
              style="font-size: 12px"
            >
              {{ syncStore.mediaDetails.SeriesName }} -
              {{ syncStore.mediaDetails.SeasonName }} Episode
              {{ syncStore.mediaDetails.IndexNumber }}
            </div>
          </div>
        </div>
      </div>
      <div id="video-osd-bottom-shadow" />
      <div id="video-osd-bottom">
        <div class="d-flex flex-row align-center ml-2">
          <div style="width: 52px; height: 52px" class="justify-center mr-2">
            <v-progress-circular
              v-if="syncStore.playbackState === 'buffering'"
              indeterminate
              @click="syncStore.togglePlay()"
              size="large"
            />
            <v-btn
              v-else
              :icon="
                syncStore.playbackState === 'playing' ? 'mdi-pause' : 'mdi-play'
              "
              density="comfortable"
              size="x-large"
              variant="text"
              @click="syncStore.togglePlay()"
            />
          </div>
          <div
            id="seekbarContainer"
            class="flex-grow-1 flex-shrink-1"
            @mouseover="showingSeekbarLabel = true"
            @mouseleave="showingSeekbarLabel = false"
            @mousemove="sliderHint($event)"
            @mousedown="startSeeking()"
            @resize="updateSeekbar()"
          >
            <div id="seekbar">
              <div
                id="seekbarLabel"
                v-show="showingSeekbarLabel || mouseDownOnSeekbar"
              />
              <div id="chapterMarkers"></div>
              <div id="seekbarDot" />
            </div>
          </div>
          <code
            v-if="
              syncStore.playbackDuration != null &&
              syncStore.playbackTimestamp != null
            "
            class="ma-2"
            >{{ formatTime(syncStore.playbackTimestamp) }} /
            {{ formatTime(syncStore.playbackDuration) }}</code
          >
          <div>
            <v-menu
              :close-on-content-click="false"
              location="bottom right"
              offset="8px"
            >
              <template v-slot:activator="{ props }">
                <v-btn
                  v-bind="props"
                  icon="mdi-cog"
                  variant="text"
                  density="comfortable"
                  size="x-large"
                />
              </template>

              <v-card class="pa-4" min-width="200">
                <span class="text-h6">Audio</span>
                <v-radio-group density="comfortable" v-model="audioTrack">
                  <v-radio
                    v-for="audioTrack in syncStore.mediaAudioDetails"
                    :key="audioTrack.trackIndex"
                    :value="audioTrack.trackIndex"
                    color="white"
                  >
                    <template #label>
                      <v-list-item
                        v-if="
                          audioTrack.title != null &&
                          audioTrack.title.length > 0 &&
                          audioTrack.title != 'No title'
                        "
                        :title="audioTrack.title"
                        :subtitle="'Language: ' + audioTrack.language"
                      />
                      <v-list-item
                        v-else
                        :title="'Language: ' + audioTrack.language"
                      />
                    </template>
                  </v-radio>
                </v-radio-group>

                <v-slider
                  v-model="volume"
                  prepend-icon="mdi-volume-low"
                  append-icon="mdi-volume-high"
                  :min="0.0"
                  :max="1.0"
                  color="white"
                  thumb-label
                >
                  <template v-slot:thumb-label="{ modelValue }">
                    {{ Math.floor(modelValue * 100) }}%
                  </template>
                </v-slider>

                <span class="text-h6">Subtitles</span>
                <v-radio-group density="comfortable" v-model="subTrack">
                  <v-radio :value="null" color="white">
                    <template #label>
                      <v-list-item title="None" />
                    </template>
                  </v-radio>
                  <v-radio
                    v-for="subtitleTrack in syncStore.mediaSubtitleDetails"
                    :key="subtitleTrack.trackIndex"
                    :value="subtitleTrack.trackIndex"
                    color="white"
                  >
                    <template #label>
                      <v-list-item
                        v-if="
                          subtitleTrack.title != null &&
                          subtitleTrack.title.length > 0 &&
                          subtitleTrack.title != 'No title'
                        "
                        :title="subtitleTrack.title"
                        :subtitle="
                          'Language: ' +
                          subtitleTrack.language +
                          ' / Format: ' +
                          subtitleTrack.format
                        "
                      />
                      <v-list-item
                        v-else
                        :title="
                          'Language: ' +
                          subtitleTrack.language +
                          ' / Format: ' +
                          subtitleTrack.format
                        "
                      />
                    </template>
                  </v-radio>
                </v-radio-group>
              </v-card>
            </v-menu>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import { useSyncStore } from "@/store/syncState";

export default {
  data() {
    return {
      syncStore: useSyncStore(),
      hideOsdTimeout: null as null | NodeJS.Timeout,
      showingSeekbarLabel: false,
      mouseDownOnSeekbar: false,
    };
  },
  methods: {
    showOsd() {
      const element = document.getElementById("video-osd");
      if (!element) return;
      element.style.opacity = "1";
      if (this.hideOsdTimeout != null) {
        clearTimeout(this.hideOsdTimeout);
      }
      this.hideOsdTimeout = setTimeout(() => {
        this.hideOsd();
      }, 3000);
    },
    hideOsd() {
      const element = document.getElementById("video-osd");
      if (element)
        element.style.opacity = "0";
    },
    formatTime(timestamp: number): string {
      let hours = Math.floor(timestamp / 3600);
      timestamp %= 3600;
      let minutes = Math.floor(timestamp / 60);
      let seconds = Math.floor(timestamp % 60);

      let hoursS = String(hours).padStart(2, "0");
      let minutesS = String(minutes).padStart(2, "0");
      let secondsS = String(seconds).padStart(2, "0");
      if (hours > 0) {
        return hoursS + ":" + minutesS + ":" + secondsS;
      } else {
        return minutesS + ":" + secondsS;
      }
    },
    sliderHint(event: MouseEvent) {
      const seekbar = document.getElementById("seekbar");
      const seekbarLabel = document.getElementById("seekbarLabel");
      const duration = this.syncStore.playbackDuration;
      if (seekbar == null || seekbarLabel == null || duration == null) return;
      const width = seekbar.offsetWidth;
      const sliderX = seekbar.offsetLeft;
      const x = event.clientX;
      const playPercentage = Math.min(
        1.0,
        Math.max(0.0, (x - sliderX) / width)
      );
      seekbarLabel.style.left = width * playPercentage - 40 + "px";
      const timeSecs = playPercentage * duration;
      const chapterName = this.chapterNameAt(timeSecs);
      if (chapterName != null) {
        seekbarLabel.innerHTML =
          "<code>" + this.formatTime(timeSecs) + "</code><br>" + chapterName;
      } else {
        seekbarLabel.innerHTML =
          "<code>" + this.formatTime(timeSecs) + "</code>";
      }

      if (this.mouseDownOnSeekbar) {
        this.updateSeekbar(playPercentage);
      }
    },
    startSeeking() {
      this.mouseDownOnSeekbar = true;
      document.addEventListener("mouseup", this.stopSeeking);
      document.addEventListener("mousemove", this.sliderHint);
    },
    stopSeeking(event: MouseEvent) {
      this.mouseDownOnSeekbar = false;
      document.removeEventListener("mouseup", this.stopSeeking);
      document.removeEventListener("mousemove", this.sliderHint);
      const seekbar = document.getElementById("seekbar");
      const seekbarLabel = document.getElementById("seekbarLabel");
      const duration = this.syncStore.playbackDuration;
      if (seekbar == null || seekbarLabel == null || duration == null) return;
      const width = seekbar.offsetWidth;
      const sliderX = seekbar.offsetLeft;
      const x = event.clientX;
      const playPercentage = Math.min(
        1.0,
        Math.max(0.0, (x - sliderX) / width)
      );
      const playbackSeconds = playPercentage * duration;
      this.syncStore.seekToSecs(playbackSeconds);
    },
    updateSeekbar(override = -1) {
      const dot = document.getElementById("seekbarDot");
      const seekbar = document.getElementById("seekbar");
      if (dot == null || seekbar == null) return;
      if (override == -1 && this.mouseDownOnSeekbar) return;
      if (
        this.syncStore.playbackTimestamp == null ||
        this.syncStore.playbackDuration == null
      ) {
        dot.style.visibility = "hidden";
        return;
      }
      dot.style.visibility = "visible";
      const playbackPercent =
        override >= 0
          ? override
          : this.syncStore.playbackTimestamp / this.syncStore.playbackDuration;
      const seekbarWidth = seekbar.offsetWidth;
      dot.style.left = Math.round(playbackPercent * seekbarWidth) - 4 + "px";
    },
    chapterNameAt(timestampSecs: number): string | null {
      const baseItem = this.syncStore.mediaDetails;
      if (baseItem == null || baseItem.Chapters == null) return null;
      let name = null as null | string;
      let bestTime = -1;
      for (let chapter of baseItem.Chapters) {
        if (
          chapter.StartPositionTicks != null &&
          chapter.StartPositionTicks / 10000000 <= timestampSecs
        ) {
          if (bestTime < chapter.StartPositionTicks) {
            bestTime = chapter.StartPositionTicks;
            name = chapter.Name ?? null;
          }
        }
      }
      return name;
    },
    updateChapterMarkers() {
      const div = document.getElementById("chapterMarkers");
      const seekbar = document.getElementById("seekbar");
      if (div == null || seekbar == null) return;
      const baseItem = this.syncStore.mediaDetails;
      if (baseItem == null || baseItem.Chapters == null) return;

      div.innerHTML = "";

      const seekbarWidth = seekbar.offsetWidth;
      const duration = this.syncStore.playbackDuration;

      if (duration == null) return;

      for (let chapter of baseItem.Chapters) {
        if (
          chapter.StartPositionTicks != null
        ) {
          const posSecs = chapter.StartPositionTicks / 10000000;
          const posPercent = posSecs / duration;
          const posX = posPercent * seekbarWidth;
          if (posX == 0) continue;
          div.innerHTML += "<div class='chapterMarker' style='left: "+posX+"px;' />";
        }
      }
    }
  },
  computed: {
    videoTime() {
      return this.syncStore.playbackTimestamp ?? 0;
    },
    subTrack: {
      get() {
        return this.syncStore.playbackSubtitleTrack;
      },
      set(val: number) {
        this.syncStore.setSubtitleTrack(val);
      },
    },
    audioTrack: {
      get() {
        return this.syncStore.playbackAudioTrack;
      },
      set(val: number) {
        this.syncStore.setAudioTrack(val);
      },
    },
    volume: {
      get(): number {
        return this.syncStore.playerVolume;
      },
      set(val: number) {
        this.syncStore.setVolume(val);
      },
    },
    chapterMarkers() {
      return this.syncStore.mediaDetails;
    },
    duration() {
      return this.syncStore.playbackDuration;
    }
  },
  watch: {
    videoTime() {
      this.updateSeekbar();
    },
    chapterMarkers() {
      this.updateChapterMarkers();
    },
    duration() {
      this.updateChapterMarkers();
    }
  },
  mounted() {
    this.$nextTick(() => {
      this.updateChapterMarkers();
    })
  }
};
</script>
<style scoped>
#video-osd {
  transition: opacity 0.4s;
  opacity: 0;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 31;
}
#video-osd-relative-container {
  position: relative;
  width: 100%;
  height: 100%;
}
#video-osd-top-shadow {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 0px;
  display: block;
  box-shadow: 0px 0px 100px 60px black;
}
#video-osd-bottom-shadow {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 0px;
  display: block;
  box-shadow: 0px 0px 100px 60px black;
}
#video-osd-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100px;
  display: block;
  padding: 16px;
}
#video-osd-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 90px;
  display: block;
  padding: 16px;
}
#seekbarLabel {
  position: absolute;
  bottom: 15px;
  text-align: center;
  background-color: black;
  padding-top: 6px;
  padding-bottom: 6px;
  min-width: 80px;
}
#seekbar {
  width: 100%;
  height: 4px;
  background-color: rgba(255, 255, 255, 0.6);
  border-radius: 2px;
  position: relative;
  top: 6px;
  margin-left: 12px;
  margin-right: 12px;
}
#seekbarContainer {
  height: 16px;
  margin-right: 24px;
}
#seekbarDot {
  width: 12px;
  height: 12px;
  border-radius: 6px;
  background-color: white;
  display: block;
  position: relative;
  top: -4px;
  left: -4px;
  z-index: 34;
}
</style>
<!--Without 'scoped' because these are elements made at runtime with JS-->
<style>
.chapterMarker {
  width: 1px;
  height: 10px;
  background-color: rgba(255, 255, 255, 0.6);
  position: absolute;
  top: -3px;
  display: block;
  z-index: 33;
}
</style>
