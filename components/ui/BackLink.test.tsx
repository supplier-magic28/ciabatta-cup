import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BackLink } from "./BackLink";

describe("BackLink", () => {
  it("renders a deterministic accessible parent link", () => {
    const markup = renderToStaticMarkup(<BackLink href="/matches">Your matches</BackLink>);
    expect(markup).toContain('href="/matches"');
    expect(markup).toContain("Your matches");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("focus-visible:ring-2");
  });
});
