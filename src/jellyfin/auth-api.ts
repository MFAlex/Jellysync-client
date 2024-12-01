import SDK from "@/jellyfin/device-id";
import { ServerCredentials } from "@/store/authStore";
import { ErrorResponse } from "@/types";

export async function authenticateWithServer(
  address: string,
  username: string,
  password: string
): Promise<ServerCredentials | ErrorResponse> {
  const api = SDK.createApi(address);

  try {
    const auth = await api.authenticateUserByName(username, password);
    if (!auth.data || !auth.data.SessionInfo) throw new Error("Bad response");
    const sessionInfo = auth.data.SessionInfo!!;
    const token = auth.data.AccessToken;
    const serverId = auth.data.ServerId;
    if (
      serverId == null ||
      token == null ||
      sessionInfo.UserId == null ||
      sessionInfo.UserName == null
    )
      throw new Error("Bad response");
    return {
      publicAddress: address,
      serverId: serverId,
      accessToken: token,
      userId: sessionInfo.UserId!!,
      userName: sessionInfo.UserName!!,
    };
  } catch (err: unknown) {
    if (err instanceof Error) {
      switch (err.message) {
        case "Network Error":
          return { reason: "Could not connect to requested jellyfin server" };
        case "Request failed with status code 400":
          return {
            reason: "Bad request. Was the username or password left blank?",
          };
        case "Bad response":
          return { reason: "Server returned unexpected data" };
        case "Request failed with status code 401":
          return { reason: "Incorrect username or password" };
      }
      return { reason: err.message };
    }
  }
  return { reason: "Unknown error occurred" };
}

export async function logoutOfServer(
  server: ServerCredentials
) {
  try {
    SDK.createApi(server.publicAddress, server.accessToken).logout();
  } catch (err: unknown) {}
}
