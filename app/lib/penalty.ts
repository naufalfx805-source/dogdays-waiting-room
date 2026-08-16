import type { Dog, Findings } from './types';

export type Penalty = {
  label: string;
  detail: string;
  factor: number;      // how many times longer than the baseline
  real: boolean;       // does the warehouse actually support this being a factor?
};

/** Turn one dog + the aggregates into the list of things that measurably help
 *  or hurt it. This is what the model is told to write against - the strategy
 *  is decided by SQL, not by the model. */
export function penaltiesFor(dog: Dog, f: Findings) {
  const base = f.headline.nonpit_median || 8;
  const out: Penalty[] = [];

  const breedRow = f.breed.find((b) => b.breed === dog.breed);
  if (dog.is_pit_bull) {
    out.push({
      label: 'breed',
      detail: `${dog.breed} — median wait ${f.headline.pit_median} days vs ${base} for other breeds`,
      factor: +(f.headline.pit_median / base).toFixed(1),
      real: true,
    });
  } else if (breedRow && breedRow.median_days > base * 1.3) {
    out.push({
      label: 'breed',
      detail: `${dog.breed} — median wait ${breedRow.median_days} days vs ${base} overall`,
      factor: +(breedRow.median_days / base).toFixed(1),
      real: true,
    });
  }

  const band = dog.age_years < 0.5 ? 'under 6mo' : dog.age_years < 2 ? '6mo-2y'
    : dog.age_years < 5 ? '2-5y' : dog.age_years < 8 ? '5-8y' : '8y+';
  const ageRow = f.age.find((a) => a.age_band === band);
  const youngest = f.age.find((a) => a.age_band === 'under 6mo');
  if (ageRow && youngest && ageRow.median_days > youngest.median_days * 1.3) {
    out.push({
      label: 'age',
      detail: `${band} — median wait ${ageRow.median_days} days vs ${youngest.median_days} for puppies`,
      factor: +(ageRow.median_days / youngest.median_days).toFixed(1),
      real: true,
    });
  }

  // The colour myth, stated explicitly so the model can be told to avoid it.
  const colourIsReal = f.headline.black_median > f.headline.nonblack_median * 1.15;
  if (dog.primary_color === 'Black') {
    out.push({
      label: 'colour (myth)',
      detail: `black dogs adopt in ${f.headline.black_median} days vs ${f.headline.nonblack_median} for every other colour — no penalty in this data`,
      factor: +(f.headline.black_median / f.headline.nonblack_median).toFixed(2),
      real: colourIsReal,
    });
  }

  return out;
}

export function briefFor(dog: Dog, pens: Penalty[]) {
  const real = pens.filter((p) => p.real);
  const myths = pens.filter((p) => !p.real);
  return {
    strategy: real.length
      ? `Lead against: ${real.map((p) => p.label).join(' + ')}.`
      : 'No measured disadvantage — write a straightforward, warm listing.',
    avoid: myths.map((p) => p.label),
    real, myths,
  };
}
