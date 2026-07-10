# ADR-0021: Tournament cover photos

- **Status:** Accepted
- **Date:** 2026-07-10

## Context

Tournament cards and the event detail hero currently communicate only through
text. The organiser needs to attach an event photo once and have it appear in
the tournament list and the green detail tile without duplicating image data or
changing the fixture model.

## Decision

Store one optional `cover_image_url` on each tournament. Admins upload, replace,
or remove the image from the detail hero through a server-authorized action.
Images are selected from JPEG, PNG, or WebP sources under 5 MB, then cropped
and resized in the browser to a 1280 x 560 WebP before upload. The crop editor
uses the same 16:7 aspect ratio as the hero and list card, with bounded zoom and
drag positioning. Images are stored in the public `tournament-images` bucket.
List cards and the detail tile render the same image with constrained dimensions
and `object-cover` so source aspect ratio does not move surrounding content.

## Consequences

- One admin upload updates every tournament read surface after revalidation.
- The image is presentation metadata and has no effect on fixtures, results,
  standings, or Elo.
- Public read access is required for authenticated player views; writes and
  deletion remain admin-only.
- Galleries, multiple photos, and player-submitted event media remain deferred.
