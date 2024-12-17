import { useAuthStore } from "@/store/authStore";
import { useSyncStore } from "@/store/syncState";
import { PlayMethod, RepeatMode } from "@jellyfin/sdk/lib/generated-client";
import { getPlaystateApi } from "@jellyfin/sdk/lib/utils/api/playstate-api";

export async function informPlaybackState() {
  const syncState = useSyncStore();
  if (syncState.playbackState == "nothing-playing") return;

  const timestamp = syncState.playbackTimestamp ?? -1;
  const bufferedRangesSecs = [{start: timestamp, end: timestamp + (syncState.playbackBuffer ?? 0)}]

  const playSessionId = syncState.playerJellyfinPlaybackSessionId;
  if (playSessionId == null) {
    console.error("PlaySessionId is null, nothing to inform jellyfin server about");
    return;
  }
  const positionTicks = Math.round(timestamp * 10000000);
  const bufferedRanges = bufferedRangesSecs.map(it => {return {start: Math.floor(it.start * 10000000), end: Math.round(it.end * 10000000)}});
  const itemId = syncState.media;
  if (itemId == null) {
    console.error("Playback media is null, nothing to inform jellyfin server about");
    return;
  }
  const mediaSourceId = itemId;
  const playbackRate = 1;
  const playMethod = syncState.playerIsTranscoding ? "Transcode" : "DirectStream" as PlayMethod;
  const repeatMode = "RepeatNone" as RepeatMode;
  const secondarySubtitleStreamIndex = -1;
  const shuffleMode = "Sorted";
  const isPaused = syncState.playbackState !== "playing";
  const isMuted = syncState.playerVolume <= 0;
  const volumeLevel = Math.round(syncState.playerVolume * 100);
  const audioStreamIndex = syncState.playbackAudioTrack;
  const subtitleStreamIndex = syncState.playbackSubtitleTrack;

  const info = {
    playSessionId,
    positionTicks,
    bufferedRanges,
    itemId,
    mediaSourceId,
    playbackRate,
    playMethod,
    repeatMode,
    secondarySubtitleStreamIndex,
    shuffleMode,
    isPaused,
    isMuted,
    volumeLevel,
    audioStreamIndex,
    subtitleStreamIndex
  }

  const authStore = useAuthStore();
  const session = authStore.getApiSessionFromPublicAddress(
    authStore.getServerByIndex(syncState.serverIndex)?.publicAddress ?? ""
  )
  if (session !== undefined) {
    try {
      await getPlaystateApi(session).onPlaybackProgress(info);
    } catch (err) {
      console.error(err);
    }
  }
}

export async function informPlaybackStarting() {
  const syncState = useSyncStore();
  if (syncState.playbackState == "nothing-playing") return;

  const playSessionId = syncState.playerJellyfinPlaybackSessionId;
  if (playSessionId == null) {
    console.error("PlaySessionId is null, nothing to inform jellyfin server about");
    return;
  }
  const itemId = syncState.media;
  if (itemId == null) {
    console.error("Playback media is null, nothing to inform jellyfin server about");
    return;
  }
  const mediaSourceId = itemId;
  const playMethod = syncState.playerIsTranscoding ? "Transcode" : "DirectStream" as PlayMethod;
  const audioStreamIndex = syncState.playbackAudioTrack;
  const subtitleStreamIndex = syncState.playbackSubtitleTrack;

  const info = {
    itemId,
    mediaSourceId,
    audioStreamIndex,
    subtitleStreamIndex,
    playMethod,
    playSessionId
  }

  const authStore = useAuthStore();
  const session = authStore.getApiSessionFromPublicAddress(
    authStore.getServerByIndex(syncState.serverIndex)?.publicAddress ?? ""
  )
  if (session !== undefined) {
    try {
      await getPlaystateApi(session).onPlaybackStart(info);
    } catch (err) {
      console.error(err);
    }
  }
}

export async function informPlaybackWatched() {
  const syncState = useSyncStore();
  const authStore = useAuthStore();
  const server = authStore.getServerByIndex(syncState.serverIndex);
  const session = authStore.getApiSessionFromPublicAddress(
    server?.publicAddress ?? ""
  )

  const itemId = syncState.media;

  if (session !== undefined && itemId != null && server != null) {
    try {
      await getPlaystateApi(session).markPlayedItem({
        userId: server.userId,
        itemId
      });
    } catch (err) {
      console.error(err);
    }
  }
}

export async function informPlaybackFinished() {
  const syncState = useSyncStore();
  const authStore = useAuthStore();
  const server = authStore.getServerByIndex(syncState.serverIndex);
  const session = authStore.getApiSessionFromPublicAddress(
    server?.publicAddress ?? ""
  )

  const itemId = syncState.media;
  if (itemId == null) {
    console.error("ItemId is null, nothing to inform jellyfin server about");
    return;
  }
  const playSessionId = syncState.playerJellyfinPlaybackSessionId;
  if (playSessionId == null) {
    console.error("PlaySessionId is null, nothing to inform jellyfin server about");
    return;
  }
  const positionTicks = Math.floor((syncState.playbackTimestamp ?? -1) * 10000000);

  const info = {
    itemId,
    playSessionId,
  } as any;
  if (positionTicks >= 0) {
    info["positionTicks"] = positionTicks;
  }

  if (session !== undefined && itemId != null && server != null) {
    try {
      await getPlaystateApi(session).onPlaybackStopped(info);
    } catch (err) {
      console.error(err);
    }
  }
}
