/**
 * Ciabatta Cup — lifecycle email renderers
 * ------------------------------------------------------------------
 * Drop-in module for lib/tournament/. Pure functions: params in,
 * { subject, html, text } out. No side effects, no env access.
 *
 * Design source: design_handoff_lifecycle_emails/README.md (authority).
 * Table-based layout, inline CSS, 600px single column, font fallbacks.
 * Web fonts load progressively (Apple Mail); Gmail falls back to Arial /
 * Courier New and the layout is designed to hold either way.
 *
 * Copy notes applied from the integration handoff:
 *  - "First to 3 games" (the engine records one short set), never "Best of 3".
 *  - Player count is dynamic, never hardcoded.
 *  - Placement points are OPTIONAL: pass `points` only once the app
 *    actually awards placement points. When omitted, the points chip and
 *    the "+N pts" record fragment are not rendered and body copy adjusts.
 *  - No em dashes in copy.
 */

import {
  C,
  F,
  bodyClose,
  bodyOpen,
  button,
  chips,
  esc,
  h1,
  header,
  para,
  pill,
  recordLine,
  shell,
  textFooter,
  zeusCard,
  type RenderedEmail,
} from "@/lib/email/components";

export type { RenderedEmail } from "@/lib/email/components";

export interface BaseEmailParams {
  firstName: string;
  tournamentName: string; // e.g. "Ciabatta Qualifier"
  startsAt: Date | string; // UTC instant; formatted using `timezone`
  timezone: string; // e.g. "Australia/Melbourne"
  locationName: string; // e.g. "Northcote Tennis Club"
  playerCount: number;
  tournamentUrl: string;
  /** Absolute base for hosted images, e.g. `${NEXT_PUBLIC_SITE_URL}/emails` (no trailing slash). */
  assetBaseUrl: string;
  /** Optional; footer shows a mailto fallback when omitted. */
  unsubscribeUrl?: string;
}

export interface ResultEmailParams extends BaseEmailParams {
  placement: 1 | 2 | 3 | 4;
  matches: Array<{ opponentName: string; score: string; won: boolean }>;
  /** Only pass once placement points are actually awarded by the app. */
  points?: number;
}

/** Season label used on seed chips; update once per season. */
const SEASON_LABEL = 'CIABATTA CUP 2026';

// ------------------------------------------------------------------
// Small utilities
// ------------------------------------------------------------------

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const countWord = (n: number) => (n >= 0 && n <= 10 ? WORDS[n] : String(n));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function fmtParts(startsAt: Date | string, timezone: string) {
  const d = typeof startsAt === 'string' ? new Date(startsAt) : startsAt;
  const get = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-AU', { timeZone: timezone, ...opts }).format(d);
  const weekday = get({ weekday: 'long' });
  const day = get({ day: 'numeric' });
  const month = get({ month: 'long' });
  const time = get({ hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\s/g, '')
    .toLowerCase(); // "10:30am"
  return {
    weekday,
    dateLong: `${weekday} ${day} ${month}`, // "Saturday 11 July"
    dateShort: `${weekday.slice(0, 3)} ${day} ${month.slice(0, 3)}`, // "Sat 11 Jul"
    time,
  };
}

// ------------------------------------------------------------------
// Email 02 · You're locked in
// ------------------------------------------------------------------

export function renderLockedInEmail(p: BaseEmailParams): RenderedEmail {
  const t = fmtParts(p.startsAt, p.timezone);
  const players = countWord(p.playerCount);
  const name = esc(p.firstName);
  const tname = esc(p.tournamentName);

  const detailsRow = (label: string, valueHtml: string, last = false, mono = false) => `
    <tr>
      <td width="88" valign="top" style="padding:12px 0;font-family:${F.mono};font-size:10px;letter-spacing:2px;color:${C.muted};${last ? '' : `border-bottom:1px solid ${C.divider};`}">${label}</td>
      <td valign="top" style="padding:12px 0;font-family:${mono ? F.mono : F.display};font-weight:${mono ? 400 : 600};font-size:${mono ? 12 : 14}px;line-height:1.5;color:${C.ink};${last ? '' : `border-bottom:1px solid ${C.divider};`}">${valueHtml}</td>
    </tr>`;

  const content =
    header(p.assetBaseUrl) +
    `<tr><td style="border-bottom:2px solid ${C.ink};line-height:0;">
      <img src="${p.assetBaseUrl}/poster-hero.jpg" width="600" height="252" alt="${tname} title poster" style="width:100%;height:auto;">
    </td></tr>` +
    bodyOpen() +
    pill('ENTRY CONFIRMED', { bg: C.green, text: C.cream }) +
    h1(`You're locked in, ${name}.`) +
    para(
      `Your name is in the bracket for the <strong>${tname}</strong>, the mini tournament that seeds Ciabatta Cup 2026. ${cap(players)} players. One seeding spot at a time.`
    ) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="background-color:${C.card};border:2px solid ${C.ink};border-radius:8px;box-shadow:3px 3px 0 ${C.ink};padding:6px 18px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${detailsRow('WHEN', `${esc(t.dateLong)} &middot; ${esc(t.time)}`)}
          ${detailsRow('WHERE', esc(p.locationName))}
          ${detailsRow('FORMAT', `${cap(players)} players &middot; Round robin &middot; First to 3 games`)}
          ${detailsRow('STAKES', 'Winner owns the court. Last takes the badger.', true, true)}
        </table>
      </td>
    </tr></table>` +
    zeusCard({
      eyebrow: 'A WORD FROM ZEUS',
      quoteHtml: `${cap(players)} names. One loaf. I have seen the bracket, ${name}, and the bracket has seen you. Welcome.`,
      shadow: C.crust,
      assetBaseUrl: p.assetBaseUrl,
    }) +
    `<div style="height:18px;line-height:18px;">&nbsp;</div>` +
    button("See who you're up against", p.tournamentUrl) +
    bodyClose;

  const subject = `You're locked in, ${p.firstName}. ${p.tournamentName}, ${t.dateShort}.`;
  const preheader = `Your name is in the bracket. ${t.dateLong} at ${t.time}, ${p.locationName}.`;

  const text = `ENTRY CONFIRMED

You're locked in, ${p.firstName}.

Your name is in the bracket for the ${p.tournamentName}, the mini tournament that seeds Ciabatta Cup 2026. ${cap(players)} players. One seeding spot at a time.

WHEN    ${t.dateLong} · ${t.time}
WHERE   ${p.locationName}
FORMAT  ${cap(players)} players · Round robin · First to 3 games
STAKES  Winner owns the court. Last takes the badger.

A WORD FROM ZEUS: "${cap(players)} names. One loaf. I have seen the bracket, ${p.firstName}, and the bracket has seen you. Welcome."

See who you're up against: ${p.tournamentUrl}${textFooter}`;

  return { subject, html: shell({ title: subject, preheader, content, unsubscribeUrl: p.unsubscribeUrl }), text };
}

// ------------------------------------------------------------------
// Email 03 · It's tournament day
// ------------------------------------------------------------------

export function renderGameDayEmail(p: BaseEmailParams): RenderedEmail {
  const t = fmtParts(p.startsAt, p.timezone);
  const players = countWord(p.playerCount);
  const name = esc(p.firstName);

  const content =
    header(p.assetBaseUrl) +
    `<tr><td align="center" style="background-color:${C.ink};padding:40px 36px 34px 36px;">
      <p style="margin:0 0 14px 0;font-family:${F.mono};font-size:11px;letter-spacing:3px;color:${C.chartreuse};">${esc(t.dateLong.toUpperCase())} &middot; THE ${esc(p.tournamentName.toUpperCase())}</p>
      <p style="margin:0 0 10px 0;font-family:${F.display};font-weight:800;font-size:44px;line-height:1.05;color:${C.cream};">IT'S TOURNAMENT DAY.</p>
      <p style="margin:0;font-family:${F.display};font-weight:700;font-size:20px;color:${C.chartreuse};">Let's get this bread.</p>
    </td></tr>
    <tr><td align="center" style="background-color:${C.green};border-top:2px solid ${C.ink};border-bottom:2px solid ${C.ink};padding:12px 20px;">
      <p style="margin:0;font-family:${F.mono};font-size:12px;letter-spacing:2px;color:${C.cream};">${esc(t.time.toUpperCase())} &middot; ${esc(p.locationName.toUpperCase())} &middot; BRING YOUR LEGS</p>
    </td></tr>
    <tr><td style="border-bottom:2px solid ${C.ink};line-height:0;">
      <img src="${p.assetBaseUrl}/northcote-hero.jpg" width="600" height="180" alt="${esc(p.locationName)} from above" style="width:100%;height:auto;">
    </td></tr>` +
    bodyOpen(30) +
    para(
      `${cap(players)} players. First to 3 games. First serve at <strong>${esc(t.time)} sharp</strong>. Warm-up starts the moment you walk in, ${name}.`
    ) +
    zeusCard({
      eyebrow: 'A WORD FROM ZEUS',
      quoteHtml: `UP. Stretch the hammies. Fear no forehand. The oven is hot, Red is already awake, and I am watching <em>everything</em>.`,
      shadow: C.crust,
      assetBaseUrl: p.assetBaseUrl,
    }) +
    `<div style="height:18px;line-height:18px;">&nbsp;</div>` +
    button("View today's schedule", p.tournamentUrl) +
    bodyClose;

  const subject = `It's tournament day. Let's get this bread.`;
  const preheader = `First serve ${t.time} at ${p.locationName}. Bring your legs.`;

  const text = `${t.dateLong.toUpperCase()} · THE ${p.tournamentName.toUpperCase()}

IT'S TOURNAMENT DAY. Let's get this bread.

${t.time.toUpperCase()} · ${p.locationName.toUpperCase()} · BRING YOUR LEGS

${cap(players)} players. First to 3 games. First serve at ${t.time} sharp. Warm-up starts the moment you walk in, ${p.firstName}.

A WORD FROM ZEUS: "UP. Stretch the hammies. Fear no forehand. The oven is hot, Red is already awake, and I am watching everything."

View today's schedule: ${p.tournamentUrl}${textFooter}`;

  return { subject, html: shell({ title: subject, preheader, content, unsubscribeUrl: p.unsubscribeUrl }), text };
}

// ------------------------------------------------------------------
// Emails 04–07 · Results (one renderer, four placements)
// NOTE: not wired into the app yet. Requires placement computation,
// new email kinds in the delivery ledger, and an admin trigger.
// ------------------------------------------------------------------

export function renderResultEmail(p: ResultEmailParams): RenderedEmail {
  const name = esc(p.firstName);
  const hasPts = typeof p.points === 'number';
  const pts = hasPts ? String(p.points) : '';

  type Cfg = {
    ordinal: string;
    heroBg: string;
    heroFg: string;
    heroBorderBottom: string;
    eyebrowColor: string;
    heroSize: number;
    pillHtml: string;
    trophy: boolean;
    subject: string;
    preheader: string;
    h1: string;
    body: string;
    bodyText: string;
    seedChip: string;
    extraChip?: { label: string; kind: 'filled' | 'outlined'; outlineColor?: string; textColor?: string };
    zeus: string;
    zeusShadow: string;
    record: string;
    buttonLabel: string;
    certificate?: boolean;
  };

  const cfgs: Record<1 | 2 | 3 | 4, Cfg> = {
    1: {
      ordinal: '1ST',
      heroBg: C.ink,
      heroFg: C.chartreuse,
      heroBorderBottom: `border-bottom:6px solid ${C.chartreuse};`,
      eyebrowColor: C.headerMuted,
      heroSize: 64,
      pillHtml: pill('OWNER OF THE COURT', { bg: C.crust, text: C.pale, border: C.caramel }),
      trophy: true,
      subject: `1st. The court is yours, ${p.firstName}.`,
      preheader: `You finished first. Zeus has crowned you.`,
      h1: `${name}, the court is yours.`,
      body: `You finished top of the field and took the whole thing. Top seed for Ciabatta Cup 2026, and bragging rights until somebody takes them off you.`,
      bodyText: `You finished top of the field and took the whole thing. Top seed for Ciabatta Cup 2026, and bragging rights until somebody takes them off you.`,
      seedChip: `TOP SEED · ${SEASON_LABEL}`,
      zeus: `I watched ${countWord(p.playerCount)} players chase one loaf. Only you, ${name}, came home smelling of victory. I hereby crown you. Screenshot this. It will not happen twice for free. Even Red is impressed, and Red has seen things.`,
      zeusShadow: C.green,
      record: `Recorded: 1st place${hasPts ? ` &middot; +${pts} pts` : ''}`,
      buttonLabel: 'See the final standings',
    },
    2: {
      ordinal: '2ND',
      heroBg: C.green,
      heroFg: C.cream,
      heroBorderBottom: `border-bottom:2px solid ${C.ink};`,
      eyebrowColor: C.paleGreen,
      heroSize: 56,
      pillHtml: pill('SO. CLOSE.', { text: C.cream, border: C.paleGreen }),
      trophy: false,
      subject: `2nd. So close, ${p.firstName}.`,
      preheader: `Second place and a serious tournament banked.`,
      h1: `Silver, ${name}. Warm silver.`,
      body: `A serious tournament${hasPts ? `, ${pts} points banked,` : ','} and second seed heading into Ciabatta Cup 2026.`,
      bodyText: `A serious tournament${hasPts ? `, ${pts} points banked,` : ','} and second seed heading into Ciabatta Cup 2026.`,
      seedChip: `2ND SEED · ${SEASON_LABEL}`,
      zeus: `A noble campaign, ${name}. Truly. Second is just first with homework.`,
      zeusShadow: C.green,
      record: `Recorded: 2nd place${hasPts ? ` &middot; +${pts} pts` : ''}`,
      buttonLabel: 'Relive the standings',
    },
    3: {
      ordinal: '3RD',
      heroBg: C.crust,
      heroFg: C.pale,
      heroBorderBottom: `border-bottom:2px solid ${C.ink};`,
      eyebrowColor: C.pale,
      heroSize: 56,
      pillHtml: pill('PODIUM. EARNED.', { text: C.pale, border: C.caramel }),
      trophy: false,
      subject: `3rd. A podium's a podium, ${p.firstName}.`,
      preheader: `A podium earned across the whole tournament.`,
      h1: `A podium's a podium, ${name}.`,
      body: `Third place${hasPts ? ` and ${pts} points` : ''}. Nobody's roasting anyone here. You showed up and you played.`,
      bodyText: `Third place${hasPts ? ` and ${pts} points` : ''}. Nobody's roasting anyone here. You showed up and you played.`,
      seedChip: `3RD SEED · ${SEASON_LABEL}`,
      zeus: `Bronze is still bread, ${name}. You played honest tennis and the loaf noticed. Next season, the crust.`,
      zeusShadow: C.crust,
      record: `Recorded: 3rd place${hasPts ? ` &middot; +${pts} pts` : ''}`,
      buttonLabel: 'See the standings',
    },
    4: {
      ordinal: '4TH',
      heroBg: C.rust,
      heroFg: C.pale,
      heroBorderBottom: `border-bottom:2px solid ${C.ink};`,
      eyebrowColor: C.pale,
      heroSize: 56,
      pillHtml: pill('OFFICIAL BADGER RECIPIENT', { bg: C.ink, text: C.cream }),
      trophy: false,
      subject: `4th. The badger is yours, ${p.firstName}.`,
      preheader: `The badger has chosen. Zeus laughed, then wept, then laughed again.`,
      h1: `The badger is yours, ${name}.`,
      body: `Fourth place${hasPts ? `, ${pts} points,` : ','} one (1) badger. The leaderboard will remember. Zeus will remember longer.`,
      bodyText: `Fourth place${hasPts ? `, ${pts} points,` : ','} one (1) badger. The leaderboard will remember. Zeus will remember longer.`,
      seedChip: `REVENGE ARC LOADING`,
      zeus: `${name}. My sweet ${name}. I laughed, then I wept, then I laughed again. Carry your badger with dignity, and remember: revenge is a dish best served topspin. Red couldn't watch.`,
      zeusShadow: C.rust,
      record: `Recorded: 4th place${hasPts ? ` &middot; +${pts} pts` : ''}`,
      buttonLabel: 'Plot your comeback',
      certificate: true,
    },
  };

  const cfg = cfgs[p.placement];
  const matchRecapHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border:2px solid ${C.ink};background-color:${C.card};">
    <tr><td colspan="2" style="padding:12px 14px;border-bottom:1px solid ${C.divider};font-family:${F.mono};font-size:10px;letter-spacing:2px;color:${C.crust};">YOUR TOURNAMENT</td></tr>
    ${p.matches.map((match, index) => `<tr>
      <td style="padding:11px 14px;${index < p.matches.length - 1 ? `border-bottom:1px solid ${C.divider};` : ''}font-family:${F.body};font-size:13px;color:${C.ink};">${match.won ? 'W' : 'L'} vs ${esc(match.opponentName)}</td>
      <td align="right" style="padding:11px 14px;${index < p.matches.length - 1 ? `border-bottom:1px solid ${C.divider};` : ''}font-family:${F.mono};font-size:12px;color:${match.won ? C.green : C.rust};">${esc(match.score)}</td>
    </tr>`).join('')}
  </table>`;
  const matchRecapText = p.matches.map((match) => `${match.won ? 'W' : 'L'} vs ${match.opponentName}: ${match.score}`).join('\n');

  const trophyHtml = cfg.trophy
    ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 16px auto;"><tr>
        <td width="62" height="34" align="center" valign="middle" bgcolor="${C.caramel}" style="background-color:${C.caramel};background-image:linear-gradient(${C.caramel},${C.crust});border-radius:17px 17px 4px 4px;font-family:${F.display};font-weight:800;font-style:italic;font-size:14px;color:${C.pale};letter-spacing:2px;">///</td>
      </tr></table>`
    : '';

  const certificateHtml = cfg.certificate
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:2px;"><tr>
        <td style="background-color:${C.card};border:2px dashed ${C.rust};border-radius:8px;padding:14px 18px;">
          <p style="margin:0 0 6px 0;font-family:${F.mono};font-size:10px;letter-spacing:2px;color:${C.rust};">REWARD CERTIFICATE</p>
          <p style="margin:0;font-family:${F.mono};font-size:12px;line-height:1.6;color:${C.ink};">Redeem: ONE (1) BADGER &middot; ${esc(p.locationName)}<br>Non-transferable. Deeply prestigious. Sort of.</p>
        </td>
      </tr></table>`
    : '';

  const chipItems: Parameters<typeof chips>[0] = [];
  if (hasPts) chipItems.push({ label: `+${pts} PTS`, kind: 'filled' });
  chipItems.push(
    p.placement === 4
      ? { label: cfg.seedChip, kind: 'outlined', outlineColor: C.rust, textColor: C.rust }
      : { label: cfg.seedChip, kind: 'outlined' }
  );

  const content =
    header(p.assetBaseUrl) +
    `<tr><td align="center" style="background-color:${cfg.heroBg};${cfg.heroBorderBottom}padding:36px 36px 30px 36px;">
      ${trophyHtml}
      <p style="margin:0 0 10px 0;font-family:${F.mono};font-size:11px;letter-spacing:3px;color:${cfg.eyebrowColor};">${esc(p.tournamentName.toUpperCase())} &middot; FINAL RESULT</p>
      <p style="margin:0 0 14px 0;font-family:${F.display};font-weight:800;font-size:${cfg.heroSize}px;line-height:1;color:${cfg.heroFg};">${cfg.ordinal}</p>
      ${cfg.pillHtml}
    </td></tr>` +
    bodyOpen(30) +
    h1(cfg.h1) +
    para(cfg.body) +
    certificateHtml +
    chips(chipItems) +
    matchRecapHtml +
    zeusCard({
      eyebrow: 'ZEUS DELIVERS THE VERDICT',
      quoteHtml: cfg.zeus,
      shadow: cfg.zeusShadow,
      assetBaseUrl: p.assetBaseUrl,
    }) +
    recordLine(cfg.record) +
    button(cfg.buttonLabel, p.tournamentUrl) +
    bodyClose;

  const text = `${p.tournamentName.toUpperCase()} · FINAL RESULT: ${cfg.ordinal}

${cfg.h1.replace(/<[^>]+>/g, '')}

${cfg.bodyText}
\nYOUR TOURNAMENT\n${matchRecapText}
${cfg.certificate ? `\nREWARD CERTIFICATE\nRedeem: ONE (1) BADGER · ${p.locationName}\nNon-transferable. Deeply prestigious. Sort of.\n` : ''}
ZEUS DELIVERS THE VERDICT: "${cfg.zeus.replace(/<[^>]+>/g, '')}"

${cfg.record.replace(/&middot;/g, '·')}

${cfg.buttonLabel}: ${p.tournamentUrl}${textFooter}`;

  return {
    subject: cfg.subject,
    html: shell({ title: cfg.subject, preheader: cfg.preheader, content, unsubscribeUrl: p.unsubscribeUrl }),
    text,
  };
}
