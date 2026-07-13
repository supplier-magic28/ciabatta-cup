import { describe, expect, it } from "vitest";
import { notificationOwnerFilter } from "./NotificationRealtimeBridge";

describe("notificationOwnerFilter", () => {
  it("scopes Realtime changes to the signed-in receiver", () => {
    expect(notificationOwnerFilter("player-123")).toBe("player_id=eq.player-123");
  });
});
