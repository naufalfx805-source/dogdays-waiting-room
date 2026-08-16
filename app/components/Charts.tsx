'use client';
import { useId, useState } from 'react';

/** Rounded only on the value end, square on the baseline. */
function barPath(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.min(r, w);
  return `M${x},${y} H${x + w - rr} A${rr},${rr} 0 0 1 ${x + w},${y + rr} V${y + h - rr} A${rr},${rr} 0 0 1 ${x + w - rr},${y + h} H${x} Z`;
}

type Tip = { x: number; y: number; lines: string[] } | null;

function Tooltip({ tip, width }: { tip: Tip; width: number }) {
  if (!tip) return null;
  const w = Math.max(...tip.lines.map((l) => l.length)) * 6.4 + 20;
  const h = tip.lines.length * 15 + 14;
  const x = Math.min(Math.max(tip.x - w / 2, 2), width - w - 2);
  return (
    <g pointerEvents="none" transform={`translate(${x},${Math.max(tip.y - h - 10, 2)})`}>
      <rect width={w} height={h} rx={7} fill="var(--surface-1)" stroke="var(--border)" />
      {tip.lines.map((l, i) => (
        <text key={i} x={10} y={19 + i * 15}
          fill={i === 0 ? 'var(--text-primary)' : 'var(--text-secondary)'}
          fontSize={i === 0 ? 12 : 11} fontWeight={i === 0 ? 600 : 400}>{l}</text>
      ))}
    </g>
  );
}

/* ---------------------------------------------------------------- bars --- */

export function BarChart({
  rows, unit = 'days', highlight, note, caption,
}: {
  rows: { label: string; value: number; sub?: string }[];
  unit?: string; highlight?: (label: string) => boolean; note?: string; caption?: string;
}) {
  const [tip, setTip] = useState<Tip>(null);
  const labelW = 108, padR = 44, rowH = 26, gap = 2, top = 26;
  const W = 720, plotW = W - labelW - padR;
  const H = top + rows.length * rowH + 8;
  const max = Math.max(...rows.map((r) => r.value)) * 1.05;
  const ticks = [0, max / 2, max].map((t) => Math.round(t));

  return (
    <figure className="figure">
      <div className="chart">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} role="img"
          aria-label={caption || 'bar chart'} onMouseLeave={() => setTip(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="gridline" x1={labelW + (t / max) * plotW} x2={labelW + (t / max) * plotW}
                y1={top - 8} y2={H - 8} />
              <text className="tick" x={labelW + (t / max) * plotW} y={top - 14} textAnchor="middle">{t}</text>
            </g>
          ))}
          <line className="baseline" x1={labelW} x2={labelW} y1={top - 8} y2={H - 8} />
          {rows.map((r, i) => {
            const y = top + i * rowH;
            const w = Math.max((r.value / max) * plotW, 2);
            const hot = highlight?.(r.label);
            return (
              <g key={r.label} className="mark"
                onMouseEnter={() => setTip({
                  x: labelW + w, y,
                  lines: [r.label, `${r.value} ${unit}`, ...(r.sub ? [r.sub] : [])],
                })}>
                <rect x={0} y={y} width={W} height={rowH} fill="transparent" />
                <text className="tick" x={labelW - 10} y={y + rowH / 2 + 4} textAnchor="end">{r.label}</text>
                <path d={barPath(labelW, y + gap, w, rowH - gap * 2 - 4)}
                  fill={hot ? 'var(--series-2)' : 'var(--series-1)'} />
                <text className="tick-v" x={labelW + w + 8} y={y + rowH / 2 + 4}>{r.value}</text>
              </g>
            );
          })}
          <Tooltip tip={tip} width={W} />
        </svg>
      </div>
      {(caption || note) && <figcaption className="figcap">{caption}{note ? ` ${note}` : ''}</figcaption>}
      <details className="table">
        <summary>Table view</summary>
        <table><thead><tr><th>Group</th><th className="num">{unit}</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.label}><td>{r.label}</td><td className="num">{r.value}</td></tr>))}
          </tbody></table>
      </details>
    </figure>
  );
}

/* ------------------------------------------------------------- grouped --- */

export function GroupedBarChart({
  rows, seriesA, seriesB, unit = 'days', caption,
}: {
  rows: { label: string; a: number | null; b: number | null }[];
  seriesA: string; seriesB: string; unit?: string; caption?: string;
}) {
  const [tip, setTip] = useState<Tip>(null);
  const labelW = 108, padR = 36, groupH = 34, top = 26;
  const W = 720, plotW = W - labelW - padR;
  const H = top + rows.length * groupH + 8;
  const max = Math.max(...rows.flatMap((r) => [r.a ?? 0, r.b ?? 0])) * 1.08;
  const ticks = [0, max / 2, max].map((t) => Math.round(t));
  const barH = 12;

  return (
    <figure className="figure">
      <div className="legend">
        <span><i style={{ background: 'var(--series-1)' }} />{seriesA}</span>
        <span><i style={{ background: 'var(--series-2)' }} />{seriesB}</span>
      </div>
      <div className="chart">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} role="img"
          aria-label={caption || 'grouped bar chart'} onMouseLeave={() => setTip(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="gridline" x1={labelW + (t / max) * plotW} x2={labelW + (t / max) * plotW}
                y1={top - 8} y2={H - 8} />
              <text className="tick" x={labelW + (t / max) * plotW} y={top - 14} textAnchor="middle">{t}</text>
            </g>
          ))}
          <line className="baseline" x1={labelW} x2={labelW} y1={top - 8} y2={H - 8} />
          {rows.map((r, i) => {
            const y = top + i * groupH;
            return (
              <g key={r.label}>
                <text className="tick" x={labelW - 10} y={y + groupH / 2 + 4} textAnchor="end">{r.label}</text>
                {([[r.a, 'var(--series-1)', seriesA, 0], [r.b, 'var(--series-2)', seriesB, barH + 2]] as const)
                  .map(([v, fill, name, dy]) => v == null ? null : (
                    <g key={name} className="mark"
                      onMouseEnter={() => setTip({
                        x: labelW + (v / max) * plotW, y: y + (dy as number),
                        lines: [`${r.label} — ${name}`, `${v} ${unit}`],
                      })}>
                      <path d={barPath(labelW, y + 3 + (dy as number), Math.max((v / max) * plotW, 2), barH)}
                        fill={fill as string} />
                      <text className="tick-v" x={labelW + (v / max) * plotW + 7}
                        y={y + 3 + (dy as number) + barH - 2}>{v}</text>
                    </g>
                  ))}
              </g>
            );
          })}
          <Tooltip tip={tip} width={W} />
        </svg>
      </div>
      {caption && <figcaption className="figcap">{caption}</figcaption>}
      <details className="table">
        <summary>Table view</summary>
        <table><thead><tr><th>Colour</th><th className="num">{seriesA}</th><th className="num">{seriesB}</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.label}><td>{r.label}</td>
              <td className="num">{r.a ?? '—'}</td><td className="num">{r.b ?? '—'}</td></tr>))}
          </tbody></table>
      </details>
    </figure>
  );
}

/* ------------------------------------------------------------- scatter --- */

export function Scatter({
  points, xLabel, yLabel, caption,
}: {
  points: { label: string; x: number; y: number; n: number }[];
  xLabel: string; yLabel: string; caption?: string;
}) {
  const [tip, setTip] = useState<Tip>(null);
  const id = useId();
  const padL = 46, padB = 44, padT = 18, padR = 16;
  const W = 720, H = 340;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxX = Math.max(...points.map((p) => p.x)) * 1.1;
  const maxY = Math.max(...points.map((p) => p.y)) * 1.12;
  const px = (x: number) => padL + (x / maxX) * plotW;
  const py = (y: number) => padT + plotH - (y / maxY) * plotH;
  const xt = [0, 20, 40, 60, 80].filter((t) => t <= maxX);
  const yt = [0, 5, 10, 15, 20, 25].filter((t) => t <= maxY);
  // Label only the points that carry the argument.
  const named = new Set(['Blue', 'Black', 'Fawn', 'Brown Brindle', 'White']);

  return (
    <figure className="figure">
      <div className="chart">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} role="img"
          aria-label={caption || 'scatter plot'} onMouseLeave={() => setTip(null)}>
          {yt.map((t) => (
            <g key={t}>
              <line className="gridline" x1={padL} x2={W - padR} y1={py(t)} y2={py(t)} />
              <text className="tick" x={padL - 8} y={py(t) + 4} textAnchor="end">{t}</text>
            </g>
          ))}
          {xt.map((t) => (
            <text key={t} className="tick" x={px(t)} y={H - padB + 18} textAnchor="middle">{t}%</text>
          ))}
          <line className="baseline" x1={padL} x2={W - padR} y1={py(0)} y2={py(0)} />
          <text className="tick" x={padL} y={H - 8}>{xLabel}</text>
          <text className="tick" x={-(padT + plotH / 2)} y={13}
            transform="rotate(-90)" textAnchor="middle">{yLabel}</text>
          {points.map((p) => (
            <g key={p.label + id} className="mark"
              onMouseEnter={() => setTip({
                x: px(p.x), y: py(p.y),
                lines: [p.label, `${p.y} days median`, `${p.x}% pit bull · n=${p.n.toLocaleString()}`],
              })}>
              <circle cx={px(p.x)} cy={py(p.y)} r={7}
                fill={named.has(p.label) ? 'var(--series-2)' : 'var(--series-1)'}
                stroke="var(--surface-1)" strokeWidth={2} />
              {named.has(p.label) && (
                <text className="tick-v" x={px(p.x) + 12} y={py(p.y) + 4}>{p.label}</text>
              )}
            </g>
          ))}
          <Tooltip tip={tip} width={W} />
        </svg>
      </div>
      {caption && <figcaption className="figcap">{caption}</figcaption>}
      <details className="table">
        <summary>Table view</summary>
        <table><thead><tr><th>Colour</th><th className="num">% pit bull</th><th className="num">median days</th><th className="num">n</th></tr></thead>
          <tbody>{points.map((p) => (
            <tr key={p.label}><td>{p.label}</td><td className="num">{p.x}</td>
              <td className="num">{p.y}</td><td className="num">{p.n.toLocaleString()}</td></tr>))}
          </tbody></table>
      </details>
    </figure>
  );
}
