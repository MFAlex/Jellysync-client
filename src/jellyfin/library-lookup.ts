import { getItemsApi } from "@jellyfin/sdk/lib/utils/api/items-api";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api/tv-shows-api";
import { ServerCredentials, useAuthStore } from "@/store/authStore";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";

export interface VideoMetadataEntry {
  Name: string;
  Id: string;
  Type: ("Series" | "Movie" | "Season" | "Episode");
  UserData: {Played: boolean};
  ProductionYear?: number;
}

export interface SeasonMetadataEntry {
  Name: string;
  Id: string;
  SeriesId: string;
  Type: ("Season");
  UserData: {Played: boolean};
  ProductionYear?: number;
}

export interface EpisodeMetadataEntry {
  Name: string;
  Id: string;
  SeriesId: string;
  SeasonId: string;
  Type: ("Episode");
  UserData: {Played: boolean};
  ProductionYear?: number;
  IndexNumber: number;
  SeasonName: string;
}

export function isDisplayableMedia(data: any): data is VideoMetadataEntry {
  return data != null && typeof data["Name"] === "string" && typeof data["Id"] === "string" && typeof data["Type"] === "string" &&
    ["Series", "Movie", "Season", "Episode"].includes(data["Type"]) && typeof data["UserData"] === "object" && typeof (data["UserData"]["Played"]) === "boolean";
}

export function isSeason(data: any): data is SeasonMetadataEntry {
  return isDisplayableMedia(data as any) && data["Type"] === "Season" && typeof data["SeriesId"] === "string";
}

export function isEpisode(data: any): data is EpisodeMetadataEntry {
  return isDisplayableMedia(data as any) && data["Type"] === "Episode" && typeof data["SeriesId"] === "string" && typeof data["SeasonId"] === "string" &&
    typeof data["IndexNumber"] === "number" && typeof data["SeasonName"] === "string";
}


export async function searchAll(
  searchTerm: string,
  server: ServerCredentials
): Promise<BaseItemDto[] | undefined> {
  const authStore = useAuthStore();
  const session = authStore.getApiSessionFromPublicAddress(
    server.publicAddress
  );
  if (session !== undefined) {
    try {
      const data = (
        await getItemsApi(session).getItems({
          userId: server.userId,
          searchTerm,
          limit: 3,
          includeItemTypes: ["Series", "Movie"],
          enableImages: false,
          enableUserData: true,
          recursive: true
        })
      ).data;
      if (data.Items != null && Array.isArray(data.Items)) {
        return data.Items;
      }
    } catch (err) {
      return undefined;
    }
  }
}

export async function getSeasons(
  show: VideoMetadataEntry,
  server: ServerCredentials
): Promise<BaseItemDto[] | undefined> {
  const authStore = useAuthStore();
  const session = authStore.getApiSessionFromPublicAddress(
    server.publicAddress
  );
  if (session !== undefined && show.Id != null && show.Type == "Series") {
    try {
      const data = (
        await getTvShowsApi(session).getSeasons({
          userId: server.userId,
          seriesId: show.Id,
          enableUserData: true,
          enableImages: false
        })
      ).data;
      if (data.Items != null && Array.isArray(data.Items)) {
        return data.Items;
      }
    } catch (err) {
      return undefined;
    }
  }
}

export async function getEpisodes(
  season: SeasonMetadataEntry,
  server: ServerCredentials
): Promise<BaseItemDto[] | undefined> {
  const authStore = useAuthStore();
  const session = authStore.getApiSessionFromPublicAddress(
    server.publicAddress
  );
  if (session !== undefined && season.Id != null && season.SeriesId != null && season.Type == "Season") {
    try {
      const data = (
        await getTvShowsApi(session).getEpisodes({
          userId: server.userId,
          seriesId: season.SeriesId,
          seasonId: season.Id,
          enableUserData: true,
          enableImages: false
        })
      ).data;
      if (data.Items != null && Array.isArray(data.Items)) {
        return data.Items;
      }
    } catch (err) {
      return undefined;
    }
  }
}

export async function getNextEpisode(
  episode: BaseItemDto,
  server: ServerCredentials
): Promise<BaseItemDto | undefined> {
  const authStore = useAuthStore();
  const session = authStore.getApiSessionFromPublicAddress(
    server.publicAddress
  );
  if (session !== undefined && episode.Id != null && episode.SeriesId != null && episode.Type == "Episode") {
    try {
      const data = (
        await getTvShowsApi(session).getEpisodes({
          userId: server.userId,
          seriesId: episode.SeriesId,
          adjacentTo: episode.Id,
          enableUserData: false,
          enableImages: false,
          startIndex: 1,
          sortBy: "IndexNumber"
        })
      ).data;
      if (data.Items != null && Array.isArray(data.Items) && data.Items.length > 0) {
        return data.Items.filter(it => it.Id != episode.Id).at(-1);
      }
    } catch (err) {
      return undefined;
    }
  }
}
