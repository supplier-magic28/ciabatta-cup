import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ZeusInboxButton, unreadBadgeLabel } from "./ZeusInboxButton";

describe("ZeusInboxButton", () => {
  it("stays visible without rendering a zero badge", () => {
    const markup = renderToStaticMarkup(<ZeusInboxButton unreadCount={0} />);
    expect(markup).toContain('href="/notifications"');
    expect(markup).toContain("Open Zeus notifications, no unread messages");
    expect(markup).not.toContain(">0</span>");
    expect(markup).toContain("h-11 w-11");
  });

  it("announces the true count while capping the visual badge", () => {
    const markup = renderToStaticMarkup(<ZeusInboxButton unreadCount={127} active />);
    expect(markup).toContain("Open Zeus notifications, 127 unread messages");
    expect(markup).toContain("99+");
    expect(markup).toContain('aria-current="page"');
  });

  it("uses singular wording for one unread message", () => {
    const markup = renderToStaticMarkup(<ZeusInboxButton unreadCount={1} />);
    expect(markup).toContain("Open Zeus notifications, 1 unread message");
    expect(unreadBadgeLabel(99)).toBe("99");
    expect(unreadBadgeLabel(100)).toBe("99+");
  });
});
