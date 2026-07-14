/** Keep post-auth navigation inside this application. */
export function safeRedirectPath(value: FormDataEntryValue | string | string[] | null | undefined) {
  const candidate = Array.isArray(value) ? value[0] : typeof value === "string" ? value : null;
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\") || /[\u0000-\u001f]/.test(candidate)) return "/";
  return candidate;
}
