const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;

export function CropZoomControl({
  zoom,
  onChange,
}: {
  zoom: number;
  onChange: (value: number) => void;
}) {
  const update = (value: number) => onChange(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2)))));

  return (
    <div className="mt-4 grid gap-2">
      <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[1.5px] text-muted">
        <span>Zoom</span>
        <span aria-live="polite">{zoom.toFixed(1)}x</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => update(zoom - ZOOM_STEP)}
          className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-ink bg-surface font-mono text-lg leading-none text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          -
        </button>
        <input
          aria-label="Photo zoom"
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(event) => update(Number(event.target.value))}
          className="min-w-0 flex-1"
        />
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => update(zoom + ZOOM_STEP)}
          className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-ink bg-surface font-mono text-lg leading-none text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
