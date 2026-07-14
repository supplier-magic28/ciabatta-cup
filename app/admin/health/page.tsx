import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionPlayer } from "@/lib/auth/session";
import { loadBackendHealth } from "@/lib/health/read";
import { healthTone, isRetryableDeliveryKind, type HealthTone } from "@/lib/health/types";
import { BackLink } from "@/components/ui/BackLink";
import { RebuildRatingsButton } from "@/components/match/RebuildRatingsButton";
import { HealthRefreshButton } from "@/components/health/HealthRefreshButton";
import { RetryDeliveryButton } from "@/components/health/RetryDeliveryButton";

const toneStyles: Record<HealthTone, { panel: string; label: string; title: string }> = {
  green: { panel: "border-green bg-green text-cream shadow-[4px_4px_0_var(--color-ink)]", label: "Healthy", title: "All systems agree" },
  amber: { panel: "border-crust bg-surface text-ink shadow-[4px_4px_0_var(--color-crust)]", label: "Attention", title: "Delivery work is waiting" },
  red: { panel: "border-rust bg-surface text-ink shadow-[4px_4px_0_var(--color-rust)]", label: "Recovery needed", title: "One or more contracts need attention" },
};

function formatTime(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Melbourne",
  }).format(new Date(value));
}

function entityHref(entityType: string, entityId: string | null) {
  if (entityType === "planned_match" && entityId) return `/matches/${entityId}`;
  if (entityType === "practice") return "/admin/approvals?kind=practice";
  if (entityType === "match") return "/matches";
  return null;
}

export default async function AdminHealthPage() {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");
  if (player.role !== "admin") redirect("/");

  const health = await loadBackendHealth();
  const tone = healthTone(health);
  const toneStyle = toneStyles[tone];
  const triggerEntries = Object.entries(health.infrastructure.triggers);
  const sent = health.deliveryCounts.sent ?? 0;
  const failed = health.deliveryCounts.failed ?? 0;
  const pending = health.deliveryCounts.pending ?? 0;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Organiser controls</p>
          <h1 className="font-heading text-3xl font-bold text-ink">System health</h1>
        </div>
        <BackLink href="/admin/approvals">Approvals</BackLink>
      </header>

      <section className={`border-2 p-5 sm:p-6 ${toneStyle.panel}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[2px]">{toneStyle.label}</p>
            <h2 className="mt-1 font-heading text-2xl font-bold">{toneStyle.title}</h2>
            <p className="mt-2 font-mono text-[10px] uppercase opacity-75">Checked {formatTime(health.generatedAt)}</p>
          </div>
          <HealthRefreshButton />
        </div>
      </section>

      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        <section className="border-2 border-ink bg-surface p-5 shadow-[3px_3px_0_var(--color-ink)]">
          <p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Scoring cache</p>
          <p className={`mt-2 font-heading text-4xl font-bold ${health.cache.drift === 0 ? "text-green" : "text-rust"}`}>{health.cache.drift}</p>
          <p className="font-mono text-[10px] uppercase text-muted">Version drift</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-hairline pt-4 font-mono text-[10px] uppercase">
            <div><dt className="text-muted">Facts</dt><dd className="mt-1 text-ink">{health.cache.factVersion}</dd></div>
            <div><dt className="text-muted">Built</dt><dd className="mt-1 text-ink">{health.cache.builtVersion}</dd></div>
          </dl>
          <p className="mt-3 font-mono text-[10px] text-muted">Last rebuilt {formatTime(health.cache.rebuiltAt)}</p>
          <div className="mt-4"><RebuildRatingsButton /></div>
        </section>

        <section className="border-2 border-ink bg-surface p-5 shadow-[3px_3px_0_var(--color-ink)]">
          <p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Email ledger</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[["Sent", sent], ["Pending", pending], ["Failed", failed]].map(([label, value]) => (
              <div key={label} className="border border-hairline p-2">
                <p className="font-heading text-2xl font-bold text-ink">{value}</p>
                <p className="font-mono text-[9px] uppercase text-muted">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 font-body text-sm text-muted">Pending delivery becomes actionable after 15 minutes. Provider idempotency prevents a retry from creating a second email.</p>
        </section>
      </div>

      <section className="mt-7 border-2 border-ink bg-surface p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Database integrity</p>
            <h2 className="mt-1 font-heading text-xl font-bold text-ink">{health.integrityIssues.length === 0 ? "No inconsistencies found" : `${health.integrityIssues.length} issue${health.integrityIssues.length === 1 ? "" : "s"}`}</h2>
          </div>
          <span className={`font-mono text-xs font-bold uppercase ${health.integrityIssues.length === 0 ? "text-green" : "text-rust"}`}>{health.integrityIssues.length === 0 ? "Clear" : "Inspect"}</span>
        </div>
        {health.integrityIssues.length > 0 && <ul className="mt-4 grid gap-2">{health.integrityIssues.map((issue) => (
          <li key={`${issue.kind}:${issue.entityId}`} className="border-l-4 border-rust bg-cream p-3 font-mono text-[10px]">
            <span className="uppercase text-rust">{issue.kind.replaceAll("_", " ")}</span>
            <span className="mt-1 block break-all text-muted">{issue.entityId}</span>
          </li>
        ))}</ul>}
      </section>

      <section className="mt-7 border-2 border-ink bg-surface p-5">
        <p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Infrastructure contracts</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {[...triggerEntries, ["notifications_realtime", health.infrastructure.notificationsRealtime] as [string, boolean]].map(([name, available]) => (
            <li key={name} className="flex items-center justify-between gap-3 border-b border-hairline py-2 font-mono text-[9px] uppercase">
              <span className="break-all text-muted">{name.replaceAll("_", " ")}</span>
              <span className={available ? "text-green" : "text-rust"}>{available ? "Present" : "Missing"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-7">
        <div className="flex items-end justify-between gap-4 border-b-2 border-ink pb-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Recovery queue</p>
            <h2 className="mt-1 font-heading text-xl font-bold text-ink">Actionable email deliveries</h2>
          </div>
          <span className="font-mono text-xs text-muted">{health.actionableDeliveries.length}</span>
        </div>
        {health.actionableDeliveries.length === 0 ? (
          <p className="mt-4 border-2 border-hairline bg-surface p-5 font-body text-sm text-muted">No failed or stale email deliveries.</p>
        ) : (
          <ul className="mt-4 grid gap-4">{health.actionableDeliveries.map((delivery) => {
            const href = entityHref(delivery.entityType, delivery.entityId);
            const retryable = isRetryableDeliveryKind(delivery.kind);
            return (
              <li key={delivery.idempotencyKey} className={`border-2 bg-surface p-4 shadow-[3px_3px_0_var(--color-ink)] ${delivery.status === "failed" ? "border-rust" : "border-crust"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={`font-mono text-[10px] uppercase ${delivery.status === "failed" ? "text-rust" : "text-crust"}`}>{delivery.status === "failed" ? "Failed" : "Stale pending"}</p>
                    <h3 className="mt-1 font-heading font-bold text-ink">{delivery.kind.replaceAll("_", " ")}</h3>
                  </div>
                  <span className="font-mono text-[9px] uppercase text-muted">Attempt {delivery.attemptCount}</span>
                </div>
                <p className="mt-2 font-mono text-[10px] text-muted">Last update {formatTime(delivery.updatedAt)}</p>
                {delivery.lastError && <p className="mt-2 border-l-2 border-rust pl-3 font-body text-sm text-ink">{delivery.lastError}</p>}
                <div className="mt-3 flex flex-wrap items-end gap-4">
                  {retryable ? <RetryDeliveryButton idempotencyKey={delivery.idempotencyKey} /> : <p className="font-mono text-[10px] text-rust">Manual recovery required for this legacy delivery kind.</p>}
                  {href && <Link href={href} className="border-b border-green font-mono text-[10px] uppercase text-green">Inspect record</Link>}
                </div>
              </li>
            );
          })}</ul>
        )}
      </section>
    </main>
  );
}
