<template>
  <div
    style="width: 100%; height: 100%; position: relative"
    id="videoPlayerContainer"
  >
    <VideoOSD />
  </div>
</template>

<script setup lang="ts">
const props = defineProps({
  videoId: { type: String, required: true },
  serverIndex: { type: Number, required: true },
});
props.videoId;
props.serverIndex;
</script>
<script lang="ts">
import {
  AudioEntry,
  getAudioDetails,
  getItemPlaybackInfo,
  getSubtitleDetails,
  getVideoPlaybackUrl,
  resolveItemId,
  SubtitleEntry,
  SubtitlePreference,
} from "@/jellyfin/playback-urls";
import { applySubtitles, cleanup } from "@/jellyfin/subtitle-helper";
import { ServerCredentials, useAuthStore } from "@/store/authStore";
import { useSyncStore } from "@/store/syncState";
import VideoOSD from "@/components/VideoOSD.vue";
import {
  BaseItemDto,
  MediaSourceInfo,
  PlaybackInfoResponse,
} from "@jellyfin/sdk/lib/generated-client";
import videojs from "video.js";
import Player from "video.js/dist/types/player";

export default {
  data() {
    return {
      authStore: useAuthStore(),
      syncState: useSyncStore(),
      player: null as null | Player,
      options: {
        preload: "auto",
        disablePictureInPicture: true,
        sources: [] as { src: string; type: string }[],
        html5: {
          vhs: {
            overrideNative: true,
          },
          nativeAudioTracks: false,
          nativeVideoTracks: false,
        },
      },
      mediaDetails: undefined as undefined | BaseItemDto,
      playbackInfo: null as null | MediaSourceInfo,
      server: undefined as undefined | ServerCredentials,
      subsReady: false,
      videoJSReady: false,
      checkBufferingTask: null as null | NodeJS.Timeout,
      subtitleTrack: null as null | SubtitleEntry,
      audioTrack: -1,
      quittingTimeout: null as null | NodeJS.Timeout,
    };
  },
  async mounted() {
    const serverIndex = this.serverIndex;
    const mediaId = this.videoId;
    this.server = this.authStore.getServerByIndex(serverIndex);
    if (this.server == null) {
      console.log(`No server at index ${serverIndex}`);
      return;
    }

    await this.lookupAndPlay(mediaId);
  },
  async unmounted() {
    cleanup();
    if (this.player != null) {
      this.player.dispose();
    }
    if (this.checkBufferingTask != null) {
      clearInterval(this.checkBufferingTask);
    }
    if (this.quittingTimeout != null) {
      clearTimeout(this.quittingTimeout);
    }
  },
  methods: {
    calculateBufferLength(): number {
      let bufferLength = 0;
      const currentTimestamp = this.player?.currentTime();
      const buffered = this.player?.buffered();
      if (buffered == null || currentTimestamp == null) return -1;
      for (let i = 0; i < buffered.length; i++) {
        var start = buffered.start(i);
        var end = buffered.end(i);
        if (start <= currentTimestamp && end > currentTimestamp) {
          bufferLength = end - currentTimestamp;
        }
      }
      return bufferLength;
    },
    updateBufferStatus() {
      let bufferLength = this.calculateBufferLength();
      const currentTimestamp = this.player?.currentTime();
      const duration = this.player?.duration();
      const readyState = this.player?.readyState();
      if (
        currentTimestamp != null &&
        bufferLength != -1 &&
        duration != null &&
        readyState != null
      ) {
        this.syncState.vJSBufferSecs(
          bufferLength,
          currentTimestamp,
          this.subsReady && readyState >= 3 /*HAVE_FUTURE_DATA*/
        );
        this.syncState.loadedMediaLength(duration);
      }
    },
    async getMediaDetails(itemId: string): Promise<BaseItemDto | undefined> {
      if (this.server == null) return; //keeps typescript happy
      return await resolveItemId(itemId, this.server);
    },
    async getMediaPlaybackDetails(
      item: BaseItemDto
    ): Promise<PlaybackInfoResponse | undefined> {
      if (this.server == null) return; //keeps typescript happy
      return await getItemPlaybackInfo(item, 0, this.server);
    },
    async getPlaybackURL(
      item: BaseItemDto,
      audioTrackIndex: number
    ): Promise<{ url: string; type: string; transcode: boolean } | undefined> {
      if (this.server == null) return; //keeps typescript happy

      const playbackInfo = await getItemPlaybackInfo(
        item,
        audioTrackIndex,
        this.server
      );

      if (playbackInfo?.PlaySessionId != null) {
        this.syncState.setJellyfinPlaybackSessionId(playbackInfo.PlaySessionId);
      }

      if (playbackInfo?.MediaSources) {
        const playbackUrl = getVideoPlaybackUrl(
          playbackInfo.MediaSources[0],
          this.server
        );
        if (playbackUrl == null) return;
        return playbackUrl;
      }
    },
    async lookupAndPlay(mediaId: string) {
      this.mediaDetails = await this.getMediaDetails(mediaId);
      if (this.mediaDetails == null) {
        console.log(
          `You cannot access the requested media ID ${mediaId}. Potential solutions: Re-login to this jellyfin server in jellysync, review that your jellyfin account has access to this media`
        );
        return;
      }

      const playbackInfo = await this.getMediaPlaybackDetails(
        this.mediaDetails
      );
      this.playbackInfo = playbackInfo?.MediaSources?.[0] ?? null;
      if (this.playbackInfo == null) {
        console.log(`Item ${mediaId} does not appear to be playable`);
        return;
      }

      const audioTracks = getAudioDetails(this.playbackInfo);
      const subtitleTracks = getSubtitleDetails(this.playbackInfo);
      this.syncState.loadedMediaDetails(
        this.mediaDetails,
        audioTracks,
        subtitleTracks
      );

      this.pickMediaTracks(audioTracks, subtitleTracks);
      await this.play(this.mediaDetails, this.audioTrack);
      this.showSubtitles(this.subtitleTrack);
    },
    pickMediaTracks(
      audioTracks: AudioEntry[],
      subtitleTracks: SubtitleEntry[]
    ) {
      const audioPreference = this.authStore.audioPreference;
      const subtitlePreference = this.authStore.subsPreference;

      const audioTrack =
        audioTracks.find((it) => it.preferred.includes(audioPreference)) ??
        (audioTracks.length > 0 ? audioTracks[0] : null);
      if (audioTrack == null) {
        console.error("No preferred audio track. Playback will not continue.");
        return;
      }
      this.audioTrack = audioTrack.trackIndex;

      const desiredSubTrack =
        subtitlePreference == "always-full" ||
        (audioTrack.preferred.includes("foreign") &&
          subtitlePreference == "full")
          ? "full"
          : subtitlePreference == "signs"
          ? "signs"
          : null;
      if (desiredSubTrack == null) {
        this.subtitleTrack = null;
      } else {
        this.subtitleTrack =
          subtitleTracks.find((it) => it.preferred.includes(desiredSubTrack)) ??
          null;
      }

      this.syncState.setAudioTrack(this.audioTrack);
      this.syncState.setSubtitleTrack(this.subtitleTrack?.trackIndex ?? -1);
      console.log(
        "Picked audio track: ",
        audioTrack,
        "and subtitle track",
        this.subtitleTrack
      );
    },
    async play(mediaDetails: BaseItemDto, audioIndex: number) {
      cleanup();
      this.videoJSReady = false;
      if (this.player != null) {
        this.player.dispose();
        this.player = null;
      }
      if (document.getElementById("videoPlayer") != null) {
        const vid = document.getElementById("videoPlayer");
        vid?.parentElement?.removeChild(vid);
      }

      const videoElement = document.createElement("video");
      videoElement.id = "videoPlayer";
      videoElement.className = "video-js";
      const videoContainer = document.getElementById("videoPlayerContainer");
      if (videoContainer == null) {
        console.error("#videoPlayerContainer not found");
        return;
      }
      videoContainer.appendChild(videoElement);

      //cleanup player stuff from last session if applicable
      videoElement.addEventListener("ended", this.syncState.vJSPlaybackEnded);
      videoElement.addEventListener("progress", this.updateBufferStatus);
      videoElement.addEventListener("timeupdate", this._timeupdate);
      videoElement.addEventListener("waiting", this._waiting);
      if (this.checkBufferingTask != null) {
        clearInterval(this.checkBufferingTask);
      }

      const url = await this.getPlaybackURL(mediaDetails, audioIndex);
      if (url == null) {
        console.error("No playback URL. Nothing to play.");
        return;
      }

      this.syncState.setLastPlayed(mediaDetails);

      this.options.sources = [
        {
          src: url.url,
          type: url.type,
        },
      ];
      this.syncState.setTranscoding(url.transcode);

      await new Promise((resolve, _) => {
        this.player = videojs(videoElement, this.options, () => {
          console.log("VideoJS Player is ready");
          this.videoJSReady = true;
          this.player!.volume(this.volume);
          resolve(true);
        });
      });

      if (this.player == null) {
        console.error("VideoJS failed to initialise");
        return;
      }

      if (this.serverTimestamp != null) {
        (this.player as Player).currentTime(this.serverTimestamp);
      }

      this.checkBufferingTask = setInterval(() => {
        if (
          this.syncState.playbackState == "buffering" &&
          (this.player?.readyState() ?? 0) >= 3
        ) {
          this.updateBufferStatus();
        } else {
          let bufferLength = this.calculateBufferLength();
          this.syncState.bufferChangeWithoutAnnouncing(bufferLength);
        }
      }, 1000);
    },
    _timeupdate() {
      const videoElement = document
        .getElementById("videoPlayer")
        ?.querySelector("video") as HTMLVideoElement | null;
      if (videoElement != null)
        this.syncState.vJSTimeChange(videoElement.currentTime);
    },
    _waiting() {
      const videoElement = document.getElementById(
        "videoPlayer"
      ) as HTMLVideoElement | null;
      if (videoElement != null) {
        if (
          this.syncState.playbackState == "playing" &&
          videoElement.readyState < videoElement.HAVE_CURRENT_DATA
        ) {
          console.log("We are buffering! " + videoElement.readyState);
          this.syncState.vJSBuffering();
        }
      }
    },
    async showSubtitles(subTrack: null | SubtitleEntry, withoutPause = false) {
      if (!withoutPause)
        this.subsReady = false;
      cleanup();
      if (subTrack == null) {
        this.subsReady = true;
        return;
      }
      const videoElement = document
        .getElementById("videoPlayer")
        ?.querySelector("video") as HTMLVideoElement | null;
      if (
        videoElement == null ||
        this.server == null ||
        this.playbackInfo == null
      ) {
        this.subsReady = true;
        console.error(
          "Could not initialise subtitles because something was null when it shouldn't be...",
          videoElement == null,
          this.server == null,
          this.playbackInfo == null
        );
        return;
      }
      const subtitleSuccess = await applySubtitles(
        videoElement,
        this.server.publicAddress,
        this.playbackInfo,
        subTrack
      );
      //TODO: The subs are loaded now. Ready for playback
      if (subtitleSuccess) {
        this.subsReady = true;
        console.log("Subtitles are ready");
      }
    },
  },
  computed: {
    serverSaysPlay() {
      return this.syncState.serverPlaybackState == "playing";
    },
    serverSaysNothingPlaying() {
      return this.syncState.serverPlaybackState == "nothing-playing";
    },
    serverTimestamp() {
      return this.syncState.serverPlaybackTimestamp;
    },
    isBuffering() {
      return !this.subsReady || !this.videoJSReady;
    },
    syncStateAudioTrack() {
      return this.syncState.playbackAudioTrack;
    },
    syncStateSubtitleTrack() {
      return this.syncState.playbackSubtitleTrack;
    },
    volume() {
      return this.syncState.playerVolume;
    },
  },
  watch: {
    serverSaysPlay(newVal) {
      if (this.syncState.serverPlaybackState === "nothing-playing") return;

      console.log(
        "Changing playing status to " + (newVal ? "playing" : "paused")
      );

      if (newVal) {
        this.player?.play();
        this.syncState.vJSPlayState("playing");
      } else {
        if (this.syncState.playbackState == "playing") {
          this.syncState.vJSPlayState("paused");
        }
        this.player?.pause();
      }

      if (
        this.player != null &&
        this.syncState.serverPlaybackTimestamp != null &&
        Math.abs(
          (this.player.currentTime() ?? 0) -
            this.syncState.serverPlaybackTimestamp
        ) > 0.1
      ) {
        this.player.currentTime(this.syncState.serverPlaybackTimestamp);
      }
      this.updateBufferStatus();
    },
    serverTimestamp(newVal) {
      if (this.player != null && newVal != null) {
        console.log("Changing timestamp to " + newVal);
        this.player.currentTime(newVal);
        this.updateBufferStatus();
      }
    },
    videoId(newVal: string) {
      this.lookupAndPlay(newVal);
    },
    async syncStateAudioTrack(newVal: number | null) {
      if (
        newVal != null &&
        this.audioTrack != newVal &&
        this.mediaDetails != null
      ) {
        this.audioTrack = newVal;
        this.syncState.vJSBuffering();
        await this.play(this.mediaDetails, this.audioTrack);
        this.showSubtitles(this.subtitleTrack);
      }
    },
    syncStateSubtitleTrack(newVal: number | null) {
      if (this.subtitleTrack != newVal && this.playbackInfo != null) {
        const subtitleTracks = getSubtitleDetails(this.playbackInfo);
        const subtitleEntry =
          subtitleTracks.find((it) => it.trackIndex == newVal) ?? null;
        this.subtitleTrack = subtitleEntry;
        this.showSubtitles(this.subtitleTrack, true);
      }
    },
    subsReady() {
      console.log("Subs ready:", this.subsReady);
      this.updateBufferStatus();
    },
    serverSaysNothingPlaying() {
      this.quittingTimeout = setTimeout(() => {
        if (this.syncState.serverPlaybackState == "nothing-playing") {
          this.syncState.vJSPlaybackEnded();
        }
      }, 3000);
    },
    volume(newVal: number) {
      this.player?.volume(newVal);
    },
  },
};
</script>
<style>
@import "video.js/dist/video-js.css";

#videoPlayer {
  width: 100%;
  height: 100%;
  z-index: 30;
}

video::cue {
  background: none;
  color: white;
  text-shadow:
    0 0 4px black,
    1px 1px 4px black,
    -1px -1px 4px black,
    1px -1px 4px black,
    -1px 1px 4px black
  ;
}
</style>
