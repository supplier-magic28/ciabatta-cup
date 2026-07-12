"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { submitExternalMatch, submitMatch } from "@/lib/match/actions";
import { validateExternalSubmission, validateSubmission } from "@/lib/match/submission";
import type { ExternalMatchSubmission, MatchFormat, MatchSubmission, MatchType, SetScore } from "@/lib/match/types";

export interface OpponentOption {
  id: string;
  name: string;
}

interface SetInput {
  selfGames: string;
  opponentGames: string;
  selfTiebreak: string;
  opponentTiebreak: string;
}

const MAX_SETS = 7;
const EXTERNAL = "__external__";

const TYPE_OPTIONS: { value: MatchType; label: string; sublabel: string }[] = [
  { value: "ranked", label: "Ranked", sublabel: "Counts for points" },
  { value: "exhibition", label: "Exhibition", sublabel: "Record only" },
];

const FORMAT_OPTIONS: { value: MatchFormat; label: string }[] = [
  { value: "one_set", label: "One set" },
  { value: "best_of_3", label: "Best of 3" },
  { value: "pro_set_8", label: "Pro set (8)" },
  { value: "custom", label: "Custom" },
];

const blankSet = (): SetInput => ({
  selfGames: "",
  opponentGames: "",
  selfTiebreak: "",
  opponentTiebreak: "",
});

const digits = (value: string) => value.replace(/[^0-9]/g, "");
const toGames = (value: string) => (value.trim() === "" ? NaN : Number(value));
const toTiebreak = (value: string) => (value.trim() === "" ? null : Number(value));

const eyebrow = "font-mono text-[10px] uppercase tracking-[2px] text-muted";
const scoreBox =
  "w-14 rounded-[8px] border-2 border-ink bg-surface px-2 py-2 text-center " +
  "font-mono text-[15px] text-ink outline-none focus:ring-2 focus:ring-green";

/**
 * Log-match submission flow, rebuilt from design screen 03 as token-driven
 * components: a 3-step wizard (matchup → type & format → scores). It validates
 * with the shared pure validator for instant feedback, then calls the
 * `submitMatch` server action. No confirm/approve, no scoring (Phase 3c-part-1).
 */
export function LogMatchForm({
  selfName,
  opponents,
  savedExternalOpponents,
}: {
  selfName: string;
  opponents: OpponentOption[];
  savedExternalOpponents: OpponentOption[];
}) {
  const [step, setStep] = useState(1);
  const [opponentId, setOpponentId] = useState("");
  const [type, setType] = useState<MatchType | "">("");
  const [format, setFormat] = useState<MatchFormat | "">("");
  const [formatNote, setFormatNote] = useState("");
  const [playedDate, setPlayedDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [location, setLocation] = useState("");
  const [sets, setSets] = useState<SetInput[]>([blankSet()]);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [externalName, setExternalName] = useState("");
  const [saveExternal, setSaveExternal] = useState(true);
  const [pending, startTransition] = useTransition();

  const isExternal = opponentId === EXTERNAL;
  const opponentName = isExternal ? (externalName.trim() || "Non-Ciabatta opponent") : opponents.find((o) => o.id === opponentId)?.name ?? "your opponent";

  function build(): MatchSubmission {
    const parsedSets: SetScore[] = sets.map((s) => ({
      selfGames: toGames(s.selfGames),
      opponentGames: toGames(s.opponentGames),
      selfTiebreak: toTiebreak(s.selfTiebreak),
      opponentTiebreak: toTiebreak(s.opponentTiebreak),
    }));
    return {
      opponentId,
      type: type as MatchType,
      format: format as MatchFormat,
      formatNote,
      playedDate,
      location,
      sets: parsedSets,
    };
  }

  function buildExternal(): ExternalMatchSubmission {
    return {
      opponentName: externalName,
      saveOpponent: saveExternal,
      format: format as MatchFormat,
      formatNote,
      playedDate,
      location,
      sets: sets.map((s) => ({
        selfGames: toGames(s.selfGames), opponentGames: toGames(s.opponentGames),
        selfTiebreak: toTiebreak(s.selfTiebreak), opponentTiebreak: toTiebreak(s.opponentTiebreak),
      })),
    };
  }

  function updateSet(index: number, patch: Partial<SetInput>) {
    setSets((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function onSubmit() {
    setError(null);
    const submission = isExternal ? buildExternal() : build();
    // Run the shared pure rules (score sanity, clear winner, custom note) for
    // instant feedback before the network. The server re-validates against the
    // real session id; SELF_SENTINEL never reaches the DB.
    const clientCheck = isExternal
      ? validateExternalSubmission(submission as ExternalMatchSubmission, SELF_SENTINEL)
      : validateSubmission(submission as MatchSubmission, SELF_SENTINEL);
    if (!clientCheck.ok) {
      setError(clientCheck.error);
      return;
    }
    startTransition(async () => {
      const result = isExternal
        ? await submitExternalMatch(submission as ExternalMatchSubmission)
        : await submitMatch(submission as MatchSubmission);
      if (result.ok) {
        setWarning(result.warning ?? null);
        setSubmitted(true);
      } else {
        setError(result.error);
      }
    });
  }

  if (submitted) {
    return (
      <div className="rounded-[8px] border-2 border-ink bg-surface p-6 shadow-[3px_3px_0_var(--color-ink)]">
        <p className={eyebrow}>Submitted</p>
        <h2 className="mt-2 font-heading text-2xl font-bold text-ink">Match logged</h2>
        <p className="mt-2 font-body text-[15px] text-ink">
          {isExternal ? "+10 points applied. No confirmation or approval needed." : `Waiting for ${opponentName} to confirm the result.`}
        </p>
        {warning && <p className="mt-3 font-mono text-[11px] text-rust">{warning}</p>}
        <div className="mt-6 flex flex-col gap-3">
          <Link href="/matches">
            <Button type="button">View your matches</Button>
          </Link>
          <button
            type="button"
            onClick={() => {
              setSubmitted(false);
              setStep(1);
              setOpponentId("");
              setType("");
              setFormat("");
              setFormatNote("");
              setPlayedDate(new Date().toLocaleDateString("en-CA"));
              setLocation("");
              setSets([blankSet()]);
              setError(null);
              setWarning(null);
              setExternalName("");
              setSaveExternal(true);
            }}
            className="font-mono text-[12px] uppercase tracking-[1.5px] text-muted underline"
          >
            Log another match
          </button>
        </div>
      </div>
    );
  }

  const canNextFromMatchup = opponentId !== "";
  const canNextFromType =
    type !== "" && format !== "" && playedDate !== "" && (format !== "custom" || formatNote.trim() !== "") && (!isExternal || externalName.trim() !== "");

  return (
    <div className="rounded-[8px] border-2 border-ink bg-surface p-6 shadow-[3px_3px_0_var(--color-ink)]">
      <header className="mb-5 flex items-baseline justify-between">
        <h1 className="font-heading text-2xl font-bold text-ink">Log match</h1>
        <span className={eyebrow}>{step}/3</span>
      </header>

      {step === 1 && (
        <section className="flex flex-col gap-3">
          <p className={eyebrow}>Matchup</p>
          <p className="font-body text-[15px] text-ink">
            <span className="font-mono text-[11px] uppercase tracking-[1.5px] text-green">
              You
            </span>{" "}
            {selfName} <span className="text-muted">vs</span>
          </p>
          {opponents.length === 0 ? (
            <p className="font-body text-[14px] text-muted">
              No other players yet — invite someone first.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {opponents.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { setOpponentId(o.id); if (type === "unranked_external") setType(""); }}
                  aria-pressed={opponentId === o.id}
                  className={
                    "rounded-[8px] border-2 border-ink px-4 py-3 text-left font-body text-[15px] " +
                    (opponentId === o.id ? "bg-green text-cream" : "bg-cream text-ink")
                  }
                >
                  {o.name}
                </button>
              ))}
            </div>
          )}
          <div className="my-1 flex items-center gap-3"><span className="h-px flex-1 bg-hairline" /><span className={eyebrow}>Not on the ladder?</span><span className="h-px flex-1 bg-hairline" /></div>
          <button type="button" onClick={() => { setOpponentId(EXTERNAL); setType("unranked_external"); }} aria-pressed={isExternal} className={`rounded-[8px] border-2 border-dashed border-green px-4 py-3 text-left ${isExternal ? "bg-green text-cream" : "bg-cream text-ink"}`}>
            <span className="block font-heading text-[15px] font-bold">Non-Ciabatta opponent</span>
            <span className="mt-1 block font-mono text-[9px] uppercase tracking-[1.2px]">Unranked · flat +10 pts</span>
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-5">
          {isExternal && (
            <div className="flex flex-col gap-3">
              <label className={eyebrow} htmlFor="external-opponent-name">Opponent name</label>
              <input id="external-opponent-name" value={externalName} maxLength={100} onChange={(event) => setExternalName(event.target.value)} placeholder="e.g. Dave from work" className="w-full rounded-[8px] border-2 border-dashed border-green bg-surface px-4 py-3 font-body text-[15px] text-ink outline-none focus:ring-2 focus:ring-green" />
              {savedExternalOpponents.length > 0 && <div className="flex flex-wrap gap-2">{savedExternalOpponents.map((opponent) => <button key={opponent.id} type="button" onClick={() => setExternalName(opponent.name)} className="rounded-full border border-green px-3 py-1 font-mono text-[10px] text-green">{opponent.name}</button>)}</div>}
              <label className="flex items-start gap-3 border-2 border-dashed border-hairline bg-cream p-3 font-body text-sm text-ink"><input type="checkbox" checked={saveExternal} onChange={(event) => setSaveExternal(event.target.checked)} className="mt-1 accent-green" /><span><strong>Save name to my profile</strong><span className="mt-1 block text-xs text-muted">For your history only. They won’t be invited and never appear on the ladder.</span></span></label>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <p className={eyebrow}>Match type</p>
            {isExternal ? <div className="grid grid-cols-2 gap-2"><div className="rounded-[8px] border-2 border-green bg-green p-3 text-cream"><strong className="font-heading">Unranked</strong><span className="block font-mono text-[9px]">FLAT +10 PTS</span></div><div className="rounded-[8px] border-2 border-dashed border-hairline p-3 text-muted"><strong className="font-heading">Ranked</strong><span className="block font-mono text-[9px]">CIABATTA ONLY</span></div></div> : <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  sublabel={o.sublabel}
                  selected={type === o.value}
                  onClick={() => setType(o.value)}
                />
              ))}
            </div>}
          </div>
          <div className="flex flex-col gap-2">
            <p className={eyebrow}>Format</p>
            <div className="flex flex-wrap gap-2">
              {FORMAT_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  selected={format === o.value}
                  onClick={() => setFormat(o.value)}
                />
              ))}
            </div>
            {format === "custom" && (
              <input
                value={formatNote}
                onChange={(e) => setFormatNote(e.target.value)}
                placeholder="Describe the format, e.g. first to 4 games"
                className="mt-1 w-full rounded-[8px] border-2 border-ink bg-surface px-4 py-3 font-body text-[15px] text-ink outline-none focus:ring-2 focus:ring-green"
              />
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={eyebrow}>Date played <span className="text-rust">Required</span><input type="date" required value={playedDate} onChange={(event) => setPlayedDate(event.target.value)} className="mt-2 w-full rounded-[8px] border-2 border-ink bg-surface px-3 py-3 font-body text-[15px] normal-case tracking-normal text-ink outline-none focus:ring-2 focus:ring-green" /></label>
            <label className={eyebrow}>Location <span className="text-muted">Optional</span><input type="text" maxLength={160} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Northcote Tennis Club" className="mt-2 w-full rounded-[8px] border-2 border-ink bg-surface px-3 py-3 font-body text-[15px] normal-case tracking-normal text-ink outline-none focus:ring-2 focus:ring-green" /></label>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-col gap-4">
          <p className={eyebrow}>Score</p>
          <div className="flex flex-col gap-4">
            {sets.map((s, i) => (
              <div key={i} className="rounded-[8px] border-2 border-hairline p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted">
                    Set {i + 1}
                  </span>
                  {sets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSets((prev) => prev.filter((_, idx) => idx !== i))}
                      className="font-mono text-[11px] text-rust"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-24 truncate font-body text-[14px] text-ink">{selfName}</span>
                  <input
                    inputMode="numeric"
                    value={s.selfGames}
                    onChange={(e) => updateSet(i, { selfGames: digits(e.target.value) })}
                    aria-label={`${selfName} games, set ${i + 1}`}
                    className={scoreBox}
                  />
                  <input
                    inputMode="numeric"
                    value={s.selfTiebreak}
                    onChange={(e) => updateSet(i, { selfTiebreak: digits(e.target.value) })}
                    aria-label={`${selfName} tie-break, set ${i + 1}`}
                    placeholder="TB"
                    className={scoreBox + " opacity-90"}
                  />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <span className="w-24 truncate font-body text-[14px] text-ink">{opponentName}</span>
                  <input
                    inputMode="numeric"
                    value={s.opponentGames}
                    onChange={(e) => updateSet(i, { opponentGames: digits(e.target.value) })}
                    aria-label={`${opponentName} games, set ${i + 1}`}
                    className={scoreBox}
                  />
                  <input
                    inputMode="numeric"
                    value={s.opponentTiebreak}
                    onChange={(e) => updateSet(i, { opponentTiebreak: digits(e.target.value) })}
                    aria-label={`${opponentName} tie-break, set ${i + 1}`}
                    placeholder="TB"
                    className={scoreBox + " opacity-90"}
                  />
                </div>
              </div>
            ))}
          </div>
          {sets.length < MAX_SETS && (
            <button
              type="button"
              onClick={() => setSets((prev) => [...prev, blankSet()])}
              className="self-start font-mono text-[12px] uppercase tracking-[1.5px] text-green"
            >
              + Add set
            </button>
          )}
          {type === "ranked" && (
            <p className="font-mono text-[10px] uppercase tracking-[1.5px] text-muted">
              Ranked results need admin approval before points move.
            </p>
          )}
        </section>
      )}

      {error && <p className="mt-4 font-mono text-[12px] text-rust">{error}</p>}

      <div className="mt-6 flex items-center justify-between gap-3">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep((s) => s - 1);
            }}
            className="font-mono text-[12px] uppercase tracking-[1.5px] text-muted"
          >
            ← Back
          </button>
        ) : (
          <Link
            href="/"
            className="font-mono text-[12px] uppercase tracking-[1.5px] text-muted"
          >
            Cancel
          </Link>
        )}

        {step < 3 ? (
          <div className="w-[160px]">
            <Button
              type="button"
              disabled={step === 1 ? !canNextFromMatchup : !canNextFromType}
              onClick={() => {
                setError(null);
                setStep((s) => s + 1);
              }}
            >
              Next
            </Button>
          </div>
        ) : (
          <div className="w-[200px]">
            <Button type="button" loading={pending} loadingLabel="Submitting..." onClick={onSubmit}>{isExternal ? "Log unranked match" : "Submit for approval"}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A sentinel id used only for client-side validation so the pure rules (score
 * sanity, clear winner, custom note) run before we hit the network. The server
 * re-validates against the real session id — this value never reaches the DB.
 */
const SELF_SENTINEL = "__self__";
