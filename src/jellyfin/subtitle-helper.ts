import { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client";
import {
  getAttachmentsUrls,
  getSubtitlePlaybackUrl,
  SubtitleEntry,
} from "./playback-urls";
import jassubWorker from "jassub/dist/jassub-worker.js?url";
import jassubWasmUrl from "jassub/dist/jassub-worker.wasm?url";
import pgssubWorker from 'libpgs/dist/libpgs.worker.js?url';
import JASSUB from "jassub";
import { PgsRenderer } from 'libpgs';

let videoObject = null as null | HTMLVideoElement;
let jassubInstance = null as null | JASSUB;
let pgsInstance = null as null | PgsRenderer;

export function cleanup() {
  if (jassubInstance != null) {
    jassubInstance.destroy();
    jassubInstance = null;
  }
  if (pgsInstance != null) {
    pgsInstance.dispose();
  }
  if (videoObject != null) {
    const allTracks = videoObject.textTracks || [];
    for (let index = 0; index < allTracks.length; index++) {
      const track = allTracks[index];
      if (track.label.includes("manualTrack")) {
        track.mode = "disabled";
      }
    }
  }
  videoObject = null;
}

export async function applySubtitles(
  mediaElement: HTMLVideoElement,
  baseUrl: string,
  media: MediaSourceInfo,
  subtitlesDetails: SubtitleEntry
): Promise<boolean> {
  const subsUrl = getSubtitlePlaybackUrl(
    media,
    subtitlesDetails.trackIndex,
    baseUrl
  );
  if (subsUrl === undefined) return false;

  const useLibass =
    subtitlesDetails.format == "ass" || subtitlesDetails.format == "ssa";
  const usePgs = subtitlesDetails.format == "PGSSUB";
  if (useLibass) {
    const fontsUrls = getAttachmentsUrls(media, baseUrl);
    return await applySSASubtitles(mediaElement, subsUrl, fontsUrls);
  } else if (usePgs) {
    return await applyPGSSubtitles(mediaElement, subsUrl);
  } else {
    return await applyVTTSubtitles(mediaElement, subsUrl);
  }
}

async function applySSASubtitles(
  mediaElement: HTMLVideoElement,
  subsUrl: string,
  attachments: string[]
): Promise<boolean> {
  cleanup();

  var options = {
    video: mediaElement,
    subUrl: subsUrl,
    ...(attachments.length > 0
      ? {
          fonts: attachments,
        }
      : {
          useLocalFonts: true,
        }),
    workerUrl: jassubWorker,
    wasmUrl: jassubWasmUrl,
  };
  jassubInstance = new JASSUB(options);

  return new Promise(function(resolve, _) {
    const function2 = () => {
      (jassubInstance as any).removeEventListener("ready", function2);
      resolve(true);
    }
    (jassubInstance as any).addEventListener("ready", function2);
  });
}

async function applyPGSSubtitles(
  mediaElement: HTMLVideoElement,
  subsUrl: string
): Promise<boolean> {
  cleanup();

  pgsInstance = new PgsRenderer({
    workerUrl: pgssubWorker,
    video: mediaElement
  });

  const response = await fetch(subsUrl);
  const arrayBuffer = await response.arrayBuffer();
  pgsInstance.loadFromBuffer(arrayBuffer);
  return true;
}

async function applyVTTSubtitles(mediaElement: HTMLVideoElement, subsUrl: string): Promise<boolean> {
  cleanup();

  const trackElement = mediaElement.addTextTrack(
    "subtitles",
    "manualTrack",
    "und"
  );
  try {
    const data: any = fetchSubtitles(subsUrl);
    for (const trackEvent of data.TrackEvents) {
      const TrackCue = window.VTTCue || window.TextTrackCue;
      const cue = new TrackCue(
        trackEvent.StartPositionTicks / 10000000,
        trackEvent.EndPositionTicks / 10000000,
        normalizeTrackEventText(trackEvent.Text)
      );

      trackElement.addCue(cue);
    }

    trackElement.mode = "showing";
    return true;
  } catch (err) {
    console.log("Error reading or parsing subtitles");
    return false;
  }
}

function normalizeTrackEventText(text: string) {
  const result = text
    .replace(/\\N/gi, "\n") // Correct newline characters
    .replace(/\r/gi, "") // Remove carriage return characters
    .replace(/{\\.*?}/gi, "") // Remove ass/ssa tags
    // Force LTR as the default direction
    .split("\n")
    .map((val) => `\u200E${val}`)
    .join("\n");
  return result;
}

async function fetchSubtitles(subsUrl: string) {
  return (
    await fetch(
      subsUrl
        .replace(".srt", ".js")
        .replace(".subrip", ".js")
        .replace(".vtt", ".js")
    )
  ).json();
}