"use client";

/* Layered, seamlessly-looping sea waves.
   Each layer is a sine ribbon twice as wide as the viewport, translated by
   exactly one half — because the wave repeats on an even period, the loop
   is invisible. */

const WAVE_W = 2880;
const WAVE_H = 132;

function wavePath(baseY: number, amplitude: number, periods: number) {
  const steps = periods * 10;
  let d = `M 0 ${baseY.toFixed(1)}`;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = t * WAVE_W;
    const y = baseY - Math.sin(t * Math.PI * 2 * periods) * amplitude;
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  d += ` L ${WAVE_W} ${WAVE_H} L 0 ${WAVE_H} Z`;
  return d;
}

type Layer = {
  amp: number;
  base: number;
  periods: number;
  dur: number;
  crest: string;
  trough: string;
};

const LAYERS: Layer[] = [
  { amp: 30, base: 84, periods: 6, dur: 26, crest: "rgba(99,102,241,0.30)", trough: "rgba(3,5,8,0.95)" },
  { amp: 23, base: 98, periods: 8, dur: 18, crest: "rgba(139,92,246,0.42)", trough: "rgba(3,5,8,0.98)" },
  { amp: 15, base: 110, periods: 10, dur: 12, crest: "rgba(167,139,250,0.62)", trough: "rgb(3,5,8)" },
];

export function SeaWaves() {
  return (
    <div className="relative w-full overflow-hidden select-none" style={{ height: WAVE_H }}>
      {LAYERS.map((L, idx) => {
        const d = wavePath(L.base, L.amp, L.periods);
        return (
          <div
            key={idx}
            className="wave-layer"
            style={{ animationDuration: `${L.dur}s` }}
            aria-hidden
          >
            <svg
              viewBox={`0 0 ${WAVE_W} ${WAVE_H}`}
              preserveAspectRatio="none"
              className="h-full w-[200%]"
            >
              <defs>
                <linearGradient id={`wave-grad-${idx}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={L.crest} />
                  <stop offset="100%" stopColor={L.trough} />
                </linearGradient>
              </defs>
              <path d={d} fill={`url(#wave-grad-${idx})`} />
              {idx === LAYERS.length - 1 && (
                <path
                  d={d}
                  fill="none"
                  stroke="rgba(196,181,253,0.35)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
          </div>
        );
      })}
    </div>
  );
}
