# ADR-0044: Public versioned trophy assets for AR handoff

- **Status:** Accepted
- **Date:** 2026-07-17

## Context

The trophy viewer and award history are authenticated, owner-only application
routes. Android Scene Viewer, however, fetches the selected GLB outside the
signed-in browser session. Running versioned model files through the auth proxy
therefore redirects a legitimate platform fetch to sign-in and breaks AR even
though the user already passed the viewer's ownership check.

The models contain only shared trophy geometry and materials. They contain no
player identity, private engraving, tournament result, or runtime credential;
those remain derived inside the authenticated viewer.

## Decision

Versioned GLB and USDZ files under the deployed static asset origin bypass the
authentication proxy and use long-lived immutable caching. Trophy sheets,
viewer routes, ownership checks, engraving ledgers, and tournament facts remain
authenticated. Runtime engraving stays in the application overlay and is never
baked into a publicly fetchable model.

## Consequences

Android WebXR and Scene Viewer can fetch the same model without session cookies,
and the immutable CDN path needs no separate storage service or secret. Anyone
who knows a model URL can download its shared geometry, so models must never
contain private or player-specific data. Automated browser checks must prove
that registered model URLs return their binary content rather than an auth
redirect.

---

<!--
ADRs are append-only (ARCHITECTURE.md §2b). Never rewrite an accepted ADR.
To change course, add a new ADR and set this one's Status to
"Superseded by ADR-XXXX".
-->
