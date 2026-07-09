"use client";

import { useId, useState, type InputHTMLAttributes } from "react";

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  /** Password fields get a Show/Hide reveal toggle. */
  reveal?: boolean;
}

const labelClass =
  "mb-1.5 block font-mono text-[10px] uppercase tracking-[2px] text-muted";
const inputClass =
  "w-full rounded-[8px] border-2 border-ink bg-surface px-4 py-3.5 " +
  "font-body text-[15px] text-ink outline-none focus:ring-2 focus:ring-green";

export function Field({ label, reveal, type = "text", ...props }: FieldProps) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const resolvedType = reveal ? (shown ? "text" : "password") : type;

  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={resolvedType}
          className={`${inputClass} ${reveal ? "pr-16" : ""}`}
          {...props}
        />
        {reveal && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            className="absolute inset-y-0 right-3 my-auto h-fit font-mono text-[11px] text-muted"
          >
            {shown ? "Hide" : "Show"}
          </button>
        )}
      </div>
    </div>
  );
}
