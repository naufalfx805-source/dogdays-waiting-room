'use client';
import { useEffect, useState } from 'react';
import { BarChart, GroupedBarChart, Scatter } from '@/components/Charts';
import { AGE_ORDER, type Findings, type Dog } from '@/lib/types';

type Rewrite = {
  listing: string; prompt: string; model: string; elapsed_ms: number;
  strategy: string; penalties: { label: string; detail: string; real: boolean }[];
  audit: { question: string; answer: string }[];
};

export default function Page() {
  const [f, setF] = useState<Findings | null>(null);
  const [dogId, setDogId] = useState('');
  const [rw, setRw] = useState<Rewrite | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/findings').then((r) => r.json()).then((d: Findings) => {
      setF(d);
      if (d.dogs?.length) setDogId(d.dogs[0].animal_id);
    }).catch(() => setErr('could not load findings'));
  }, []);

  if (err && !f) return <main className="wrap"><p style={{ marginTop: 80 }}>{err}</p></main>;
  if (!f) return <main className="wrap"><p style={{ marginTop: 80 }} className="src">Querying the warehouse…</p></main>;

  const h = f.headline;
  const dog = f.dogs.find((d) => d.animal_id === dogId) ?? f.dogs[0];
  const other = f.controlled.filter((c) => c.breed_group === 'other breed');
  const pit = f.controlled.filter((c) => c.breed_group === 'pit bull');
  const colours = f.color.map((c) => c.color);
  const blue = f.color.find((c) => c.color === 'Blue');
  const black = f.color.find((c) => c.color === 'Black');
  const pitBlack = pit.find((r) => r.color === 'Black')?.median_days;
  const pitOther = pit.filter((r) => r.color !== 'Black');
  const pitOtherMed = pitOther.length
    ? Math.round(pitOther.reduce((s, r) => s + r.median_days, 0) / pitOther.length)
    : null;

  async function rewrite() {
    setBusy(true); setRw(null); setErr('');
    try {
      const res = await fetch('/api/rewrite', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dog, findings: f }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'request failed');
      setRw(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'rewrite failed');
    } finally { setBusy(false); }
  }

  return (
    <main className="wrap">
      <header style={{ paddingTop: 72 }}>
        <p className="kicker">The Waiting Room</p>
        <h1>Everybody knows black dogs wait longer.<br />347,587 shelter records disagree.</h1>
        <p className="lede">
          Black dog syndrome is the best-known piece of folklore in animal rescue: dark-coated dogs
          are said to sit in shelters far longer than light ones. Shelters repeat it themselves, and
          it is why some of them run black-dog promotions. So I loaded every intake and outcome
          Austin Animal Center has published into Snowflake and measured it.
        </p>
        <p className="lede">
          The median black dog is adopted in <strong>{h.black_median} days</strong>.
          Every other colour: <strong>{h.nonblack_median} days</strong>. The gap is nothing.
          But something real is hiding underneath it.
        </p>
      </header>

      <section className="tiles">
        {[
          [(h.intake_rows + h.outcome_rows).toLocaleString(), 'raw records loaded'],
          [h.paired_stays.toLocaleString(), 'shelter stays reconstructed'],
          [h.dog_adoptions.toLocaleString(), 'dog adoptions measured'],
          [`${h.pit_median} vs ${h.nonpit_median}`, 'days: pit bull vs other breed'],
        ].map(([v, k]) => (
          <div className="tile" key={k}><div className="v">{v}</div><div className="k">{k}</div></div>
        ))}
      </section>
      <p className="src">
        Source: <code>{f.source === 'snowflake' ? 'live Snowflake query' : 'bundled aggregate export'}</code>
        {' · '}{f.elapsed_ms} ms
      </p>

      <h2>1. The folklore, measured</h2>
      <p>
        Here is every coat colour with at least 300 adoptions, ranked by how long the median dog
        waited. If the myth were true, black would be at the top. It sits in the middle of the pack,
        level with white — and it is the single largest group in the data.
      </p>
      <BarChart
        rows={f.color.map((c) => ({ label: c.color, value: c.median_days, sub: `n=${c.n.toLocaleString()}` }))}
        highlight={(l) => l === 'Black'}
        caption="Median days from intake to adoption, by primary coat colour. Black highlighted."
        note="Colours with fewer than 300 adoptions are excluded."
      />

      <h2>2. But one colour really does wait</h2>
      <p>
        <strong>Blue</strong> dogs wait {blue?.median_days} days — more than twice the median.
        &ldquo;Blue&rdquo; is a grey-slate coat, and if you know dogs you can already guess the
        problem. Plot each colour against the share of dogs wearing it that the shelter recorded as
        a pit bull, and the whole ranking resolves into one line.
      </p>
      <Scatter
        points={f.color.map((c) => ({ label: c.color, x: c.pct_pit_bull, y: c.median_days, n: c.n }))}
        xLabel="share of this colour recorded as pit bull"
        yLabel="median days to adoption"
        caption="Each dot is one coat colour. The colours that wait are the colours pit bulls come in."
      />
      <p>
        Blue is <strong>{blue?.pct_pit_bull}% pit bull</strong> — the highest of any colour. Black is
        just {black?.pct_pit_bull}%. The colour ranking was never about colour.
      </p>

      <h2>3. Control for breed and the colour effect disappears</h2>
      <p>
        The test: hold breed fixed and let colour vary. Among dogs that are not pit bulls, the spread
        across every coat colour collapses to a few days. Among pit bulls, every colour waits a long
        time. Colour is not doing the work in either group.
      </p>
      <GroupedBarChart
        rows={colours.map((c) => ({
          label: c,
          a: other.find((r) => r.color === c)?.median_days ?? null,
          b: pit.find((r) => r.color === c)?.median_days ?? null,
        })).filter((r) => r.a != null || r.b != null)}
        seriesA="other breeds" seriesB="pit bulls"
        caption="The same colours, split by breed group. Within each group the bars are nearly flat."
      />
      <p>
        There is one honest caveat, and it is the interesting part. Inside the pit bull group, black
        <em> is</em> the slowest colour — {pitBlack} days against about {pitOtherMed} for the rest.
        So black dog syndrome is not invented. It is a roughly five-day effect living inside a
        nineteen-day breed effect, and the folklore credits it with the whole gap.
      </p>

      <h2>4. What actually decides how long a dog waits</h2>
      <p>Breed, and age. Both effects are about three times larger than anything colour does.</p>
      <BarChart
        rows={f.breed.slice(0, 12).map((b) => ({ label: b.breed.replace(' Mix', ' (mix)'), value: b.median_days, sub: `n=${b.n.toLocaleString()}` }))}
        highlight={(l) => l.toLowerCase().includes('pit bull')}
        caption="Slowest-adopting breeds with at least 200 adoptions."
      />
      <BarChart
        rows={AGE_ORDER.map((band) => {
          const r = f.age.find((a) => a.age_band === band);
          return { label: band, value: r?.median_days ?? 0, sub: `n=${r?.n.toLocaleString() ?? 0}` };
        })}
        highlight={(l) => l === '8y+'}
        caption="Median days to adoption by age at intake."
      />

      <h2>5. So write the listing against the real problem</h2>
      <p>
        Knowing this changes what a shelter should write. The instinct for a black dog is
        &ldquo;don&rsquo;t overlook me because of my coat&rdquo; — which spends the listing defending
        against a disadvantage the data says does not exist, and repeats the myth to every reader.
      </p>
      <p>
        These are <strong>real dogs</strong> from the dataset who waited a month or more. The app
        computes each one&rsquo;s measured disadvantage in SQL, then hands Gemini a brief naming
        which factor to lead against — and which one to say nothing about.
      </p>

      <div className="card">
        <div className="dogrow">
          <select value={dogId} onChange={(e) => { setDogId(e.target.value); setRw(null); }}>
            {f.dogs.slice(0, 120).map((d: Dog) => (
              <option key={d.animal_id} value={d.animal_id}>
                {d.name} — {d.breed}, {d.color}, {d.age_years}y — waited {d.los_days} days
              </option>
            ))}
          </select>
          <button onClick={rewrite} disabled={busy}>{busy ? 'Writing…' : 'Write the listing'}</button>
        </div>

        {dog && (
          <p className="src" style={{ marginBottom: 12 }}>
            {dog.name} arrived as a {dog.intake_type.toLowerCase()} in {dog.intake_condition.toLowerCase()} condition
            and waited <strong>{dog.los_days} days</strong>.
          </p>
        )}
        {err && <p className="src" style={{ color: 'var(--series-2)' }}>{err}</p>}

        {rw && (
          <>
            <div style={{ marginBottom: 10 }}>
              {rw.penalties.map((p) => (
                <span key={p.label} className={`pill ${p.real ? 'real' : 'myth'}`}>
                  {p.real ? '↑ real: ' : '✕ myth: '}{p.detail}
                </span>
              ))}
            </div>
            <p className="src" style={{ marginBottom: 14 }}><strong>Brief from SQL:</strong> {rw.strategy}</p>
            <p className="listing">{rw.listing}</p>
            {rw.audit.length > 0 && (
              <p className="src" style={{ marginTop: 14 }}>
                Constraint check (a second, closed-question call):{' '}
                {rw.audit.map((a) => `${a.question} ${a.answer}`).join(' · ')}
                {rw.audit.every((a) => a.answer === 'NO') ? ' — held.' : ' — violated, the myth leaked in.'}
              </p>
            )}
            <details className="table" style={{ marginTop: 14 }}>
              <summary>The exact prompt ({rw.model}, {rw.elapsed_ms} ms)</summary>
              <pre className="prompt">{rw.prompt}</pre>
            </details>
          </>
        )}
      </div>

      <h2>Method</h2>
      <p>
        Every number on this page is computed by SQL over the raw public data, not quoted from
        anywhere. Austin Animal Center publishes intakes and outcomes as two separate tables with no
        stay identifier, and a dog can pass through the shelter many times, so joining on{' '}
        <code>animal_id</code> alone produces a cross product. The fix is to number each
        animal&rsquo;s intakes and outcomes by date and pair the nth with the nth, which recovers{' '}
        {h.paired_stays.toLocaleString()} distinct stays. Waits are capped at 365 days and the
        analysis is restricted to {h.dog_adoptions.toLocaleString()} adoption outcomes for dogs.
      </p>
      <p className="src">
        Data: <a href="https://data.austintexas.gov/Government/Austin-Animal-Center-Intakes/wter-evkm">Austin Animal Center Intakes</a>
        {' and '}<a href="https://data.austintexas.gov/Government/Austin-Animal-Center-Outcomes/9t4d-g238">Outcomes</a>,
        public domain. Warehouse: Snowflake. Listing text: Google Gemini.
        Breed here is the shelter&rsquo;s own visual identification, which is known to be unreliable
        for bully breeds — that is a property of the label, and it is the label adopters see too.
      </p>
    </main>
  );
}
