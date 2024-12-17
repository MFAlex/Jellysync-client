import {
  BaseItemKind,
  ItemFilter,
  ItemSortBy,
  MediaStreamType,
  SubtitleDeliveryMethod,
  type BaseItemDto,
  type MediaSourceInfo,
  type MediaStream,
  type PlaybackInfoResponse,
} from "@jellyfin/sdk/lib/generated-client";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api/items-api";
import { getMediaInfoApi } from "@jellyfin/sdk/lib/utils/api/media-info-api";
import playbackProfile from "@/jellyfin/playback-profiles";
import { ServerCredentials, useAuthStore } from "@/store/authStore";
import { ensureDeviceId } from "./device-id";

export interface AudioEntry {
  trackIndex: number;
  language: string;
  title: string;
  preferred: AudioPreference[];
}
export interface SubtitleEntry {
  trackIndex: number;
  language: string;
  title: string;
  format: "PGSSUB" | "ass" | "ssa" | "srt" | "vtt" | "subrip";
  preferred: SubtitlePreference[];
}
export type AudioPreference = "english" | "foreign";
export type SubtitlePreference = "off" | "signs" | "full" | "always-full";

export async function resolveItemId(
  itemId: string,
  server: ServerCredentials
): Promise<BaseItemDto | undefined> {
  const authStore = useAuthStore();
  const session = authStore.getApiSessionFromPublicAddress(
    server.publicAddress
  );
  if (session !== undefined) {
    try {
      const data = (
        await getItemsApi(session).getItems({
          userId: server.userId,
          ids: [itemId],
          enableImages: false,
          enableUserData: false,
          fields: ["Chapters"]
        })
      ).data;
      if (data.Items && data.Items.length == 1) {
        return data.Items[0];
      }
    } catch (err) {
      return undefined;
    }
  }
}

export async function getItemPlaybackInfo(
  item: BaseItemDto,
  audioStreamIndex = 0,
  server: ServerCredentials
): Promise<PlaybackInfoResponse | undefined> {
  const authStore = useAuthStore();
  const session = authStore.getApiSessionFromPublicAddress(
    server.publicAddress
  );
  if (session !== undefined && item?.Id) {
    return (
      await getMediaInfoApi(session).getPostedPlaybackInfo({
        itemId: item.Id,
        userId: session.configuration.username,
        autoOpenLiveStream: true,
        playbackInfoDto: { DeviceProfile: playbackProfile },
        mediaSourceId: item.Id,
        audioStreamIndex,
        subtitleStreamIndex: 0,
      })
    ).data;
  }
}

export function getVideoPlaybackUrl(
  mediaSource: MediaSourceInfo,
  server: ServerCredentials
): {url: string, type: string, transcode: boolean} | undefined {
  if (
    mediaSource?.SupportsDirectStream &&
    mediaSource.Type &&
    mediaSource.Id &&
    mediaSource.Container
  ) {
    const directOptions: Record<string, string> = {
      Static: String(true),
      mediaSourceId: mediaSource.Id,
      deviceId: ensureDeviceId(),
      api_key: server.accessToken,
      Tag: mediaSource.ETag ?? "",
      LiveStreamId: mediaSource.LiveStreamId ?? "",
    };

    const parameters = new URLSearchParams(directOptions).toString();

    return {url: `${server.publicAddress}/Videos/${mediaSource.Id}/stream.${mediaSource.Container}?${parameters}`, type: 'video/'+mediaSource.Container, transcode: false};
  } else if (
    server !== undefined &&
    mediaSource?.SupportsTranscoding &&
    mediaSource.TranscodingUrl
  ) {
    return {url: `${server.publicAddress}${mediaSource.TranscodingUrl}`, type: "application/x-mpegURL", transcode: true};
  }
}

export function getSubtitleDetails(
  mediaSource: MediaSourceInfo
): SubtitleEntry[] {
  const list = [] as SubtitleEntry[];

  const subtitleTracks =
    mediaSource.MediaStreams?.filter(
      (it) =>
        it != null &&
        it.Type == "Subtitle" &&
        it.Codec != null &&
        ["PGSSUB", "ass", "ssa", "srt", "vtt", "subrip"].includes(it.Codec)
    ) ?? [];

  subtitleTracks.forEach((it) => {
    if (it.Index !== undefined) {
      list.push({
        trackIndex: it.Index,
        language: it.Language ?? "Unknown",
        title: it.Title ?? "No title",
        format: it.Codec as "PGSSUB" | "ass" | "ssa" | "srt" | "vtt" | "subrip",
        preferred: [],
      });
    }
  });

  const bestFull = list.findIndex(it => {
    const title = it.title.toLowerCase();
    return (it.language.toLowerCase().includes("english") || title.includes("eng")) && (title.includes("dialog") || title.includes("full") || title.includes("honorific") || title.includes("honourific"))
  })
  const bestSigns = list.findIndex(it => {
    const title = it.title.toLowerCase();
    return (it.language.toLowerCase().includes("english") || title.includes("eng")) && (title.includes("sign") || title.includes("s&s"))
  })

  if (bestFull != -1) {
    list[bestFull].preferred.push("full");
  } else if (list.length > 0) {
    list[0].preferred.push("full");
  }

  if (bestSigns != -1) {
    list[bestSigns].preferred.push("signs");
  } else if (list.length > 0) {
    list[0].preferred.push("signs");
  }

  return list;
}

export function getAudioDetails(mediaSource: MediaSourceInfo): AudioEntry[] {
  const list = [] as AudioEntry[];

  const audioTracks =
    mediaSource.MediaStreams?.filter(
      (it) => it != null && it.Type == "Audio"
    ) ?? [];

  audioTracks.forEach((it) => {
    if (it.Index)
      list.push({
        trackIndex: it.Index,
        language: it.Language ?? "Unknown",
        title: it.Title ?? "No title",
        preferred: []
      });
  });

  const englishTrack = list.findIndex(it => it.language.toLowerCase().includes("eng") || it.title.toLowerCase().includes("eng"))
  const foreignTrack = list.findIndex(it => !it.language.toLowerCase().includes("eng") && !it.title.toLowerCase().includes("eng"))

  if (englishTrack != -1) {
    list[englishTrack].preferred.push("english");
  } else if (list.length > 0) {
    list[0].preferred.push("english");
  }

  if (foreignTrack != -1) {
    list[foreignTrack].preferred.push("foreign");
  } else if (list.length > 0) {
    list[0].preferred.push("foreign");
  }

  return list;
}

export function getSubtitlePlaybackUrl(
  mediaSource: MediaSourceInfo,
  subtitleTrackIndex: number,
  baseUrl: string
): string | undefined {
  const track = mediaSource.MediaStreams?.find(
    (it) => subtitleTrackIndex === it.Index
  );
  if (track !== undefined) {
    if (
      track.Codec == "ass" ||
      track.Codec == "ssa" ||
      track.Codec == "PGSSUB" ||
      track.Codec == "srt" ||
      track.Codec == "vtt" ||
      track.Codec == "subrip"
    ) {
      return baseUrl + track.DeliveryUrl;
    }
  } else {
    return undefined;
  }
}

export function getAttachmentsUrls(
  mediaSource: MediaSourceInfo,
  baseUrl: string
): string[] {
  const track =
    mediaSource.MediaAttachments?.filter(
      (it) =>
        it != null &&
        ((it.Codec != null &&
        ["ttf", "otf", "woff"].includes(it.Codec)) || it.MimeType == "font/ttf" || it.MimeType == "font/otf") &&
        it.DeliveryUrl != null
    ) ?? [];
  if (track.length > 0) {
    return track.map((it) => baseUrl + it.DeliveryUrl);
  } else {
    return [];
  }
}
