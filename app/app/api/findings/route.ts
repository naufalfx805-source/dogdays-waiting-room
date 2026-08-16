import { NextResponse } from 'next/server';
import { hasSnowflake, query, lower } from '@/lib/snowflake';
import type { Findings, Headline, ColorRow, ControlledRow, BreedRow, AgeRow, Dog } from '@/lib/types';

import headlineJson from '@/data/headline.json';
import colorJson from '@/data/color.json';
import controlledJson from '@/data/color_controlled.json';
import breedJson from '@/data/breed.json';
import ageJson from '@/data/age.json';
import dogsJson from '@/data/dogs.json';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** The bundled copy is the same aggregate tables, exported from the local
 *  DuckDB validation run. It exists so the page still renders if the
 *  warehouse is asleep, and it always says so in the UI. */
function bundled(elapsed_ms: number): Findings {
  return {
    source: 'bundled', elapsed_ms,
    headline: (headlineJson as Headline[])[0],
    color: colorJson as ColorRow[],
    controlled: controlledJson as ControlledRow[],
    breed: breedJson as BreedRow[],
    age: ageJson as AgeRow[],
    dogs: dogsJson as Dog[],
  };
}

export async function GET() {
  const t0 = Date.now();
  if (!hasSnowflake()) return NextResponse.json(bundled(Date.now() - t0));

  try {
    const [headline, color, controlled, breed, age, dogs] = await Promise.all([
      query('SELECT * FROM agg_headline'),
      query('SELECT * FROM agg_color ORDER BY median_days DESC'),
      query('SELECT * FROM agg_color_controlled ORDER BY breed_group, median_days DESC'),
      query('SELECT * FROM agg_breed ORDER BY median_days DESC'),
      query('SELECT * FROM agg_age'),
      query('SELECT * FROM dogs_waiting ORDER BY los_days DESC'),
    ]);
    return NextResponse.json({
      source: 'snowflake', elapsed_ms: Date.now() - t0,
      headline: lower<Headline>(headline)[0],
      color: lower<ColorRow>(color),
      controlled: lower<ControlledRow>(controlled),
      breed: lower<BreedRow>(breed),
      age: lower<AgeRow>(age),
      dogs: lower<Dog>(dogs),
    } satisfies Findings);
  } catch (err) {
    console.error('snowflake query failed, serving bundled copy:', err);
    return NextResponse.json(bundled(Date.now() - t0));
  }
}
