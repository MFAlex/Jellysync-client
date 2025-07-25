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

// Simple browser-compatible SRT to ASS converter (basic timing and text only)
function simpleSrtToAss(srt: string): string {
  // ASS header with DejaVuSans
  const header = `[Script Info]\nScriptType: v4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,DejaVuSans,20,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;
  // SRT to ASS time format
  function srtTimeToAss(time: string) {
    return time.replace(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/, (_m, h, m, s, ms) => `${h}:${m}:${s}.${ms.substring(0,2)}`);
  }
  // Convert HTML tags and SRT /anX codes to ASS formatting
  function htmlToAss(text: string): string {
    // Convert SRT /anX positioning codes at the start of a line
    text = text.replace(/(^|\n)\/an(\d)/gi, (m, p1, p2) => `${p1}{\\an${p2}}`);
    // Convert HTML tags to ASS
    text = text
      .replace(/<i>/gi, '{\\i1}')
      .replace(/<\/i>/gi, '{\\i0}')
      .replace(/<b>/gi, '{\\b1}')
      .replace(/<\/b>/gi, '{\\b0}')
      .replace(/<u>/gi, '{\\u1}')
      .replace(/<\/u>/gi, '{\\u0}')
      .replace(/<br\s*\/?>(?!\n)/gi, '\\N'); // <br> to ASS newline
    // Remove any other HTML tags
    text = text.replace(/<[^>]+>/g, '');
    return text;
  }
  // Parse SRT blocks
  const blocks = srt.split(/\r?\n\r?\n/);
  const events = blocks.map(block => {
    const lines = block.split(/\r?\n/).filter(Boolean);
    if (lines.length < 3) return null;
    // lines[0] = index, lines[1] = time, rest = text
    const [start, end] = lines[1].split(" --> ").map(srtTimeToAss);
    let text = lines.slice(2).join("\\N");
    text = htmlToAss(text);
    // Do NOT remove braces: they are needed for ASS override tags
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
  }).filter(Boolean);
  return header + "\n" + events.join("\n");
}


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

export async function addAssSubtitlesFromSrt(
  subtitles: SubtitleEntry[],
  media: MediaSourceInfo,
  baseUrl: string
): Promise<SubtitleEntry[]> {
  // Only add .ass if there are no .ass or .ssa tracks
  const hasAss = subtitles.some(s => s.format === "ass" || s.format === "ssa");
  if (hasAss) return subtitles;
  // Only add if there is at least one srt
  const srtSubs = subtitles.filter(s => s.format === "subrip");
  if (srtSubs.length === 0) return subtitles;

  // For each srt, fetch and convert to ass, and add as a new entry
  const newSubs: SubtitleEntry[] = [...subtitles];
  // Find the highest current trackIndex to avoid collisions
  let maxTrackIndex = subtitles.reduce((max, s) => Math.max(max, s.trackIndex), -1);
  for (const srtEntry of srtSubs) {
    try {
      const subsUrl = getSubtitlePlaybackUrl(media, srtEntry.trackIndex, baseUrl);
      if (!subsUrl) continue;
      const response = await fetch(subsUrl);
      const srtText = await response.text();
      const assText = simpleSrtToAss(srtText);
      // Store the ASS text, Blob, and Blob URL for the converted ASS text
      const assBlob = new Blob([assText], { type: "text/plain" });
      const assUrl = URL.createObjectURL(assBlob);
      // Assign a unique trackIndex
      maxTrackIndex += 1;
      const assEntry: SubtitleEntry = {
        ...srtEntry,
        trackIndex: maxTrackIndex,
        format: "ass",
        title: (srtEntry.title || "") + " (ASS converted)",
        // @ts-ignore
        _assUrl: assUrl, // for cleanup if needed
        // @ts-ignore
        _assBlob: assBlob, // for legacy/debug
        // @ts-ignore
        _assText: assText, // pass the raw ASS text for worker compatibility
      };
      newSubs.push(assEntry);
    } catch (err) {
      console.error("Failed to convert SRT to ASS for entry", srtEntry, err);
    }
  }
  return newSubs;
}

export async function applySubtitles(
  mediaElement: HTMLVideoElement,
  baseUrl: string,
  media: MediaSourceInfo,
  subtitlesDetails: SubtitleEntry
): Promise<boolean> {
    // Use Blob URL for generated .ass subtitles if present
    let subsUrl: string | undefined = undefined;
    let subsContent: string | undefined = undefined;
    if ((subtitlesDetails.format === "ass" || subtitlesDetails.format === "ssa") && (subtitlesDetails as any)._assUrl) {
        subsUrl = (subtitlesDetails as any)._assUrl;
        if ((subtitlesDetails as any)._assText) {
            subsContent = (subtitlesDetails as any)._assText;
        }
    } else {
        subsUrl = getSubtitlePlaybackUrl(
            media,
            subtitlesDetails.trackIndex,
            baseUrl
        );
    }
    if (subsUrl === undefined) return false;

    const useLibass = subtitlesDetails.format === "ass" || subtitlesDetails.format === "ssa";
    const usePgs = subtitlesDetails.format === "PGSSUB";
    if (useLibass) {
        const fontsUrls = getAttachmentsUrls(media, baseUrl);
        return await applySSASubtitles(mediaElement, subsUrl, fontsUrls, subsContent);
    } else if (usePgs) {
        return await applyPGSSubtitles(mediaElement, subsUrl);
    } else if (subsUrl) {
        return await applyVTTSubtitles(mediaElement, subsUrl);
    }
    return false;
}

async function applySSASubtitles(
  mediaElement: HTMLVideoElement,
  subsUrl: string,
  attachments: string[],
  subsContent?: string
): Promise<boolean> {
  cleanup();

  // Always add DejaVuSans.ttf from public/fonts
  const dejaVuFontUrl = '/fonts/DejaVuSans.ttf';
  let fontsArr = attachments ? [...attachments] : [];
  if (!fontsArr.includes(dejaVuFontUrl)) fontsArr.push(dejaVuFontUrl);
  var options: any = {
    video: mediaElement,
    subUrl: subsUrl,
    fonts: fontsArr,
    workerUrl: jassubWorker,
    wasmUrl: jassubWasmUrl,
  };
  if (subsContent) {
    options.subContent = subsContent;
  }
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
  videoObject = mediaElement;

  const trackElement = mediaElement.addTextTrack(
    "subtitles",
    "manualTrack",
    "und"
  );
  try {
    const data: any = await fetchSubtitles(subsUrl);
    for (const trackEvent of data.TrackEvents) {
      const cue = new window.VTTCue(
        trackEvent.StartPositionTicks / 10000000,
        trackEvent.EndPositionTicks / 10000000,
        normalizeTrackEventText(trackEvent.Text)
      );

      const srtCommand = trackEvent.Text.match(/^{\\an\d{1,2}}/gi);
      if (srtCommand != null && srtCommand.length == 1) {
        const position = parseInt(srtCommand[0].substring(4, srtCommand[0].indexOf("}")));
        if (position > 6) {
          cue.line = 0; //position at the top
        } else if (position > 3) {
          cue.line = -2; //position above the bottom row, meant to be the center
        } else {
          cue.line = -1;
        }

        if (position == 7 || position == 4 || position == 1) {
          cue.lineAlign = "start";
        } else if (position == 8 || position == 5 || position == 2) {
          cue.align = "center";
        } else {
          cue.align = "end";
        }
      }

      trackElement.addCue(cue);
    }

    trackElement.mode = "showing";
    return true;
  } catch (err) {
    console.error("Error reading or parsing subtitles", err);
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
