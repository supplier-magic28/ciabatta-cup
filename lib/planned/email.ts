import {
  C,
  F,
  bodyClose,
  bodyOpen,
  button,
  detailCard,
  esc,
  h1,
  header,
  para,
  pill,
  shell,
  textFooter,
  zeusCard,
  type RenderedEmail,
} from "@/lib/email/components";

const ZEUS_AVATAR = "zeus-red.png";
const ZEUS_SIGNOFF = "— ZEUS APPROVES";

export interface MatchLockedInEmailInput {
  firstName: string;
  opponentName: string;
  matchDateTime: string;
  location: string;
  matchUrl: string;
  assetBaseUrl: string;
  externalOpponent: boolean;
  unsubscribeUrl?: string;
}

export type ConfirmedScoringVariant = "ranked" | "exhibition" | "external";

export interface ResultConfirmedEmailInput {
  winnerName: string;
  loserName: string;
  score: string;
  matchTypeLabel: string;
  matchDate: string;
  scoringVariant: ConfirmedScoringVariant;
  ladderUrl: string;
  assetBaseUrl: string;
  unsubscribeUrl?: string;
}

function footnote(text: string) {
  return `<p style="margin:16px 0 0 0;text-align:center;font-family:${F.mono};font-size:10px;line-height:1.6;color:${C.muted};">${esc(text)}</p>`;
}

function pointsCard(input: ResultConfirmedEmailInput) {
  const winner = esc(input.winnerName);
  const row = (labelHtml: string, detail: string, points: string, last = false) =>
    `<tr><td style="padding:13px 0;${last ? "" : `border-bottom:1px solid ${C.divider};`}font-family:${F.body};font-size:14px;line-height:1.45;color:${C.ink};">${labelHtml}<br><span style="color:${C.muted};font-size:12px;">${esc(detail)}</span></td><td align="right" valign="middle" style="padding:13px 0;${last ? "" : `border-bottom:1px solid ${C.divider};`}font-family:${F.display};font-weight:700;font-size:18px;color:${C.green};white-space:nowrap;">${esc(points)}</td></tr>`;

  let rows: string;
  let footerLabel: string;
  let footerPoints: string;
  if (input.scoringVariant === "ranked") {
    rows = row("Both players", "for playing", "+15") + row(winner, "winner's bonus", "+15", true);
    footerLabel = "DROUGHT CLOCKS RESET FOR BOTH";
    footerPoints = "+30 / +15 TOTAL";
  } else if (input.scoringVariant === "exhibition") {
    rows = row("Both players", "flat, win or lose", "+10", true);
    footerLabel = "NO WINNER BONUS · NO ELO MOVEMENT · CLOCKS RESET";
    footerPoints = "+10 EACH";
  } else {
    rows = row("Ciabatta player", "flat, win or lose", "+10", true);
    footerLabel = "NON-CIABATTA · NO ELO MOVEMENT · CLOCK RESET";
    footerPoints = "+10 TOTAL";
  }

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background-color:${C.card};border:2px solid ${C.ink};border-radius:8px;box-shadow:3px 3px 0 ${C.ink};padding:4px 18px 0 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}<tr><td colspan="2" style="border-top:2px solid ${C.ink};padding:12px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-family:${F.mono};font-size:9px;line-height:1.5;letter-spacing:1px;color:${C.muted};">${footerLabel}</td><td align="right" style="font-family:${F.mono};font-size:10px;line-height:1.5;color:${C.ink};white-space:nowrap;">${footerPoints}</td></tr></table></td></tr></table></td></tr></table>`;
}

export function matchLockedInEmail(input: MatchLockedInEmailInput): RenderedEmail {
  const firstName = esc(input.firstName);
  const opponentName = esc(input.opponentName);
  const accepted = input.externalOpponent
    ? `Your match with <strong>${opponentName}</strong> is locked in. The court is booked in spirit, if not in law.`
    : `<strong>${opponentName}</strong> accepted. You're both committed — the court is booked in spirit, if not in law.`;
  const content =
    header(input.assetBaseUrl, ZEUS_AVATAR) +
    bodyOpen() +
    pill("MATCH LOCKED IN", { bg: C.green, text: C.cream }) +
    h1(`It's on, ${firstName}.`) +
    para(accepted) +
    detailCard([
      { label: "WHO", valueHtml: `${firstName} vs ${opponentName}` },
      { label: "WHEN", valueHtml: esc(input.matchDateTime) },
      { label: "WHERE", valueHtml: esc(input.location) },
      { label: "STAKES", valueHtml: "UNDECIDED — RANKED OR NOT, YOU SETTLE IT AFTER", mono: true },
    ]) +
    zeusCard({
      eyebrow: "A WORD FROM ZEUS",
      quoteHtml: `A promise made in front of me is a promise kept, ${firstName}. Bring shoes. Bring nerve. The rest we decide when it's done.`,
      shadow: C.crust,
      assetBaseUrl: input.assetBaseUrl,
      avatarFile: ZEUS_AVATAR,
      signoff: ZEUS_SIGNOFF,
    }) +
    `<div style="height:18px;line-height:18px;">&nbsp;</div>` +
    button("View your match", input.matchUrl) +
    footnote("Plans change? Either of you can move or cancel it from the match page.") +
    bodyClose;

  const subject = `Ciabatta Cup: Match locked in - ${input.firstName} vs ${input.opponentName}`;
  const preheader = `${input.firstName} vs ${input.opponentName}, ${input.matchDateTime}.`;
  const bodyText = input.externalOpponent
    ? `Your match with ${input.opponentName} is locked in. The court is booked in spirit, if not in law.`
    : `${input.opponentName} accepted. You're both committed — the court is booked in spirit, if not in law.`;
  const text = `MATCH LOCKED IN

It's on, ${input.firstName}.

${bodyText}

WHO     ${input.firstName} vs ${input.opponentName}
WHEN    ${input.matchDateTime}
WHERE   ${input.location}
STAKES  UNDECIDED — RANKED OR NOT, YOU SETTLE IT AFTER

A WORD FROM ZEUS: "A promise made in front of me is a promise kept, ${input.firstName}. Bring shoes. Bring nerve. The rest we decide when it's done."
${ZEUS_SIGNOFF}

View your match: ${input.matchUrl}

Plans change? Either of you can move or cancel it from the match page.${textFooter}`;

  return { subject, html: shell({ title: subject, preheader, content, unsubscribeUrl: input.unsubscribeUrl }), text };
}

export function resultConfirmedEmail(input: ResultConfirmedEmailInput): RenderedEmail {
  const winner = esc(input.winnerName);
  const loser = esc(input.loserName);
  const isExternal = input.scoringVariant === "external";
  const body = isExternal
    ? "The result is recorded and your points have landed:"
    : "Both of you have signed off. It's on the record and the ladder has moved:";
  const quoteHtml = isExternal
    ? `Recorded by you, witnessed by me. ${winner} won. ${loser} — you know where the courts are. Book the rematch.`
    : `Agreed by both, witnessed by me. ${winner} climbs. ${loser} — you know where the courts are. Book the rematch.`;
  const quoteText = isExternal
    ? `Recorded by you, witnessed by me. ${input.winnerName} won. ${input.loserName} — you know where the courts are. Book the rematch.`
    : `Agreed by both, witnessed by me. ${input.winnerName} climbs. ${input.loserName} — you know where the courts are. Book the rematch.`;
  const content =
    header(input.assetBaseUrl, ZEUS_AVATAR) +
    bodyOpen() +
    pill("RESULT CONFIRMED", { bg: C.ink, text: C.chartreuse }) +
    h1(`${winner} d. ${loser}`) +
    `<p style="margin:0 0 18px 0;font-family:${F.mono};font-size:16px;line-height:1.5;color:${C.ink};">${esc(input.score)} &middot; ${esc(input.matchTypeLabel)} &middot; ${esc(input.matchDate)}</p>` +
    para(body) +
    pointsCard(input) +
    zeusCard({
      eyebrow: "A WORD FROM ZEUS",
      quoteHtml,
      shadow: C.crust,
      assetBaseUrl: input.assetBaseUrl,
      avatarFile: ZEUS_AVATAR,
      signoff: ZEUS_SIGNOFF,
    }) +
    `<div style="height:18px;line-height:18px;">&nbsp;</div>` +
    button("See the ladder", input.ladderUrl) +
    bodyClose;

  const subject = `Ciabatta Cup: ${input.winnerName} d. ${input.loserName} - result confirmed`;
  const preheader = `${input.winnerName} d. ${input.loserName}. The result is confirmed.`;
  const pointsText = input.scoringVariant === "ranked"
    ? `Both players — for playing  +15
${input.winnerName} — winner's bonus  +15
DROUGHT CLOCKS RESET FOR BOTH  +30 / +15 TOTAL`
    : input.scoringVariant === "exhibition"
      ? `Both players — flat, win or lose  +10
NO WINNER BONUS · NO ELO MOVEMENT · CLOCKS RESET  +10 EACH`
      : `Ciabatta player — flat, win or lose  +10
NON-CIABATTA · NO ELO MOVEMENT · CLOCK RESET  +10 TOTAL`;
  const text = `RESULT CONFIRMED

${input.winnerName} d. ${input.loserName}
${input.score} · ${input.matchTypeLabel} · ${input.matchDate}

${body}

${pointsText}

A WORD FROM ZEUS: "${quoteText}"
${ZEUS_SIGNOFF}

See the ladder: ${input.ladderUrl}${textFooter}`;

  return { subject, html: shell({ title: subject, preheader, content, unsubscribeUrl: input.unsubscribeUrl }), text };
}
