/** Shared, email-client-safe Ciabatta Cup rendering primitives. */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export const C = {
  cream: "#EFE6D0",
  ink: "#1B1A16",
  green: "#3E6B35",
  chartreuse: "#C9DA5A",
  crust: "#8C5426",
  rust: "#A0442C",
  card: "#F7F0DE",
  divider: "#D9CCAE",
  muted: "#8C8672",
  headerMuted: "#8A9188",
  pale: "#F5E7CC",
  paleGreen: "#BFD3B4",
  caramel: "#C98A4B",
} as const;

export const F = {
  display: `'Bricolage Grotesque', Arial, Helvetica, sans-serif`,
  body: `'Work Sans', Arial, Helvetica, sans-serif`,
  mono: `'IBM Plex Mono', 'Courier New', Courier, monospace`,
} as const;

export const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function shell(opts: {
  title: string;
  preheader: string;
  content: string;
  unsubscribeUrl?: string;
}) {
  const { title, preheader, content } = opts;
  const unsub = opts.unsubscribeUrl ?? "#";
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(title)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=Work+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  table { border-collapse:collapse; }
  img { border:0; outline:none; text-decoration:none; display:block; }
  a { color:${C.green}; }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.cream};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.cream};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;">
${content}
<tr><td style="background-color:${C.ink};padding:18px 28px;" align="center">
  <p style="margin:0 0 6px 0;font-family:${F.mono};font-size:10px;letter-spacing:2px;color:${C.headerMuted};">COMPETE &middot; TRAIN &middot; LAUGH &middot; REPEAT</p>
  <p style="margin:0 0 6px 0;font-family:${F.display};font-weight:700;font-size:11px;color:${C.cream};">CIABATTA <span style="color:${C.chartreuse};">CUP</span> <span style="font-family:${F.mono};font-weight:400;color:${C.headerMuted};">2026</span></p>
  <p style="margin:0;font-family:${F.mono};font-size:9px;color:${C.headerMuted};">You're getting this because you stepped on court. <a href="${esc(unsub)}" style="color:${C.chartreuse};">Unsubscribe</a>. Zeus will know.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function header(assetBaseUrl: string, avatarFile = "zeus-avatar.jpg") {
  return `<tr><td style="background-color:${C.ink};padding:14px 28px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td align="left" style="font-family:${F.display};font-weight:700;font-size:16px;letter-spacing:1px;color:${C.cream};">CIABATTA <span style="color:${C.chartreuse};">CUP</span></td>
    <td align="right">
      <table role="presentation" cellpadding="0" cellspacing="0" align="right"><tr>
        <td style="font-family:${F.mono};font-size:9px;letter-spacing:2px;color:${C.headerMuted};padding-right:10px;">THE ORACLE IS IN</td>
        <td><img src="${esc(`${assetBaseUrl}/${avatarFile}`)}" width="36" height="36" alt="Zeus, the oracle" style="border-radius:50%;border:2px solid ${C.chartreuse};"></td>
      </tr></table>
    </td>
  </tr></table>
</td></tr>`;
}

export function button(label: string, url: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;"><tr>
  <td align="center" bgcolor="${C.green}" style="background-color:${C.green};border:2px solid ${C.ink};border-radius:8px;box-shadow:3px 3px 0 ${C.ink};">
    <a href="${esc(url)}" style="display:block;padding:16px 20px;font-family:${F.display};font-weight:700;font-size:16px;letter-spacing:1px;color:${C.cream};text-decoration:none;">${esc(label)}</a>
  </td>
</tr></table>`;
}

export function zeusCard(opts: {
  eyebrow: string;
  quoteHtml: string;
  shadow: string;
  assetBaseUrl: string;
  avatarFile?: string;
  signoff?: string;
}) {
  const signoff = opts.signoff
    ? `<p style="margin:10px 0 0 0;font-family:${F.mono};font-size:11px;letter-spacing:2px;color:${C.green};">${esc(opts.signoff)}</p>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0 0;"><tr>
  <td style="background-color:${C.card};border:2px solid ${C.ink};border-radius:8px;box-shadow:3px 3px 0 ${opts.shadow};padding:16px 18px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="56" valign="top" style="padding-right:14px;">
        <img src="${esc(`${opts.assetBaseUrl}/${opts.avatarFile ?? "zeus-avatar.jpg"}`)}" width="56" height="56" alt="Zeus, with Red on his head" style="border-radius:50%;border:2px solid ${C.ink};">
      </td>
      <td valign="top">
        <p style="margin:0 0 6px 0;font-family:${F.mono};font-size:10px;letter-spacing:2px;color:${C.crust};">${esc(opts.eyebrow)}</p>
        <p style="margin:0;font-family:${F.body};font-size:15px;line-height:1.5;color:${C.ink};">${opts.quoteHtml}</p>${signoff}
      </td>
    </tr></table>
  </td>
</tr></table>`;
}

export function chips(items: Array<{ label: string; kind: "filled" | "outlined"; outlineColor?: string; textColor?: string }>) {
  const cells = items
    .map((chip) =>
      chip.kind === "filled"
        ? `<td style="padding-right:8px;"><span style="display:inline-block;background-color:${C.ink};color:${C.chartreuse};font-family:${F.mono};font-size:12px;letter-spacing:1px;border-radius:20px;padding:7px 14px;">${esc(chip.label)}</span></td>`
        : `<td style="padding-right:8px;"><span style="display:inline-block;border:2px solid ${chip.outlineColor ?? C.ink};color:${chip.textColor ?? C.ink};font-family:${F.mono};font-size:11px;letter-spacing:1px;border-radius:20px;padding:6px 13px;">${esc(chip.label)}</span></td>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;"><tr>${cells}</tr></table>`;
}

export function pill(label: string, opts: { bg?: string; text: string; border?: string }) {
  const bg = opts.bg ? `background-color:${opts.bg};` : "";
  const border = opts.border ? `border:2px solid ${opts.border};` : "";
  return `<span style="display:inline-block;${bg}${border}color:${opts.text};font-family:${F.mono};font-size:11px;letter-spacing:2px;border-radius:20px;padding:7px 16px;">${esc(label)}</span>`;
}

export const bodyOpen = (padTop = 34) =>
  `<tr><td style="background-color:${C.cream};padding:${padTop}px 36px 36px 36px;">`;
export const bodyClose = `</td></tr>`;
export const h1 = (textHtml: string, size = 30) =>
  `<h1 style="margin:14px 0 12px 0;font-family:${F.display};font-weight:700;font-size:${size}px;line-height:1.1;color:${C.ink};">${textHtml}</h1>`;
export const para = (html: string) =>
  `<p style="margin:0 0 18px 0;font-family:${F.body};font-size:15px;line-height:1.55;color:${C.ink};">${html}</p>`;
export const recordLine = (html: string) =>
  `<p style="margin:16px 0 14px 0;font-family:${F.mono};font-size:11px;line-height:1.6;color:${C.muted};">${html}</p>`;
export const textFooter = `\n\nCOMPETE · TRAIN · LAUGH · REPEAT\nCIABATTA CUP 2026\nYou're getting this because you stepped on court. Zeus will know.`;

export function detailCard(rows: Array<{ label: string; valueHtml: string; mono?: boolean }>) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="background-color:${C.card};border:2px solid ${C.ink};border-radius:8px;box-shadow:3px 3px 0 ${C.ink};padding:6px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${rows.map((row, index) => {
          const last = index === rows.length - 1;
          const border = last ? "" : `border-bottom:1px solid ${C.divider};`;
          return `<tr><td width="88" valign="top" style="padding:12px 0;font-family:${F.mono};font-size:10px;letter-spacing:2px;color:${C.muted};${border}">${esc(row.label)}</td><td valign="top" style="padding:12px 0;font-family:${row.mono ? F.mono : F.display};font-weight:${row.mono ? 400 : 600};font-size:${row.mono ? 12 : 14}px;line-height:1.5;color:${C.ink};${border}">${row.valueHtml}</td></tr>`;
        }).join("")}
      </table>
    </td>
  </tr></table>`;
}
