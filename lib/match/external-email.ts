import "server-only";

export type ExternalMatchEmailInput = {
  firstName: string;
  opponentName: string;
  score: string;
  won: boolean;
};

const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

export function renderExternalMatchEmail(input: ExternalMatchEmailInput) {
  const firstName = esc(input.firstName);
  const opponentName = esc(input.opponentName);
  const score = esc(input.score);
  const verdict = input.won ? "BREAD SECURED." : "THE OVEN REMEMBERS.";
  const headline = input.won ? `A tidy one, ${firstName}.` : `Points banked, ${firstName}.`;
  const quote = input.won
    ? `You ventured beyond the ladder and returned victorious. ${opponentName} has been noted.`
    : `A loss beyond the ladder still feeds the campaign. Learn, recover, return.`;
  const subject = input.won ? `+10. Bread secured, ${input.firstName}.` : `+10 banked, ${input.firstName}.`;
  const text = `${verdict}\n\n${headline}\n\n${input.won ? "Win" : "Loss"} vs ${input.opponentName}: ${input.score}\nNON-CIABATTA · UNRANKED · +10 PTS\n\nA WORD FROM ZEUS: “${input.won ? `You ventured beyond the ladder and returned victorious. ${input.opponentName} has been noted.` : "A loss beyond the ladder still feeds the campaign. Learn, recover, return."}”`;
  const html = `<!doctype html><html><body style="margin:0;background:#EFE6D0;color:#1B1A16"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px"><table role="presentation" width="600" style="max-width:600px;background:#F7F0DE;border:2px solid #1B1A16"><tr><td style="background:#1B1A16;padding:34px;text-align:center;color:#C9DA5A;font-family:Arial,sans-serif"><div style="font-size:11px;letter-spacing:3px">NON-CIABATTA MATCH</div><h1 style="margin:12px 0 0;font-size:38px">${verdict}</h1></td></tr><tr><td style="padding:34px;font-family:Arial,sans-serif"><h2 style="font-size:28px;margin:0 0 18px">${headline}</h2><div style="border:2px dashed #3E6B35;padding:18px"><strong>${input.won ? "WIN" : "LOSS"} vs ${opponentName}</strong><div style="margin-top:8px;font-family:monospace">${score}</div><div style="margin-top:12px;color:#3E6B35;font-family:monospace">UNRANKED · NO LADDER MOVEMENT · +10 PTS</div></div><table role="presentation" width="100%" style="margin-top:24px;background:#EFE6D0;border:2px solid #1B1A16"><tr><td width="90" style="padding:14px"><img src="${esc(process.env.NEXT_PUBLIC_SITE_URL ?? "")}/emails/zeus-red.png" width="64" height="64" alt="Zeus"></td><td style="padding:14px"><div style="font:11px monospace;color:#3E6B35">A WORD FROM ZEUS</div><p style="margin:8px 0 0">${quote}</p></td></tr></table></td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}
