import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import type { Dog, Findings } from '@/lib/types';
import { penaltiesFor, briefFor } from '@/lib/penalty';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: 'GEMINI_API_KEY is not set' }, { status: 503 });

  const { dog, findings } = (await req.json()) as { dog: Dog; findings: Findings };
  if (!dog?.animal_id) return NextResponse.json({ error: 'no dog supplied' }, { status: 400 });

  const pens = penaltiesFor(dog, findings);
  const brief = briefFor(dog, pens);
  const ai = new GoogleGenAI({ apiKey: key });

  // The warehouse decides the angle; the model only executes it. Everything in
  // FINDINGS is a number this app computed, not something the model recalled.
  const prompt = `You are writing the adoption listing for one real shelter dog.

DOG
  name: ${dog.name}
  breed: ${dog.breed}
  colour: ${dog.color}
  age at intake: ${dog.age_years} years
  sex: ${dog.sex_upon_intake}
  condition on arrival: ${dog.intake_condition}
  how it arrived: ${dog.intake_type}
  it actually waited: ${dog.los_days} days before someone adopted it

FINDINGS from ${findings.headline.dog_adoptions.toLocaleString()} real adoptions at this shelter
${pens.map((p) => `  - ${p.label}: ${p.detail}${p.real ? '' : '  <-- NOT a real factor'}`).join('\n') || '  - no measured disadvantage'}

STRATEGY (decided by the data, not by you)
  ${brief.strategy}
${brief.avoid.length ? `  Do NOT apologise for, excuse, or even mention: ${brief.avoid.join(', ')}. The data shows it makes no difference, and repeating the myth spreads it.` : ''}

RULES
  - 90-130 words, warm and specific, second person to the reader.
  - Address the real disadvantage head-on and reframe it as information, never as a warning.
  - Invent no facts: no training history, no medical history, no personality traits you were not given.
  - No emoji. No exclamation marks. Do not mention statistics, data, or this brief.
  - Output only the listing text.`;

  const t0 = Date.now();
  const res = await ai.models.generateContent({ model: MODEL, contents: prompt });
  const listing = (res.text ?? '').trim();

  // Closed-question check. Open-ended self-review is unreliable; a yes/no
  // constraint check is the form these models actually get right.
  let audit: { question: string; answer: string }[] = [];
  if (listing && brief.avoid.length) {
    const checks = brief.avoid.map((a) =>
      `Does the text below mention the dog's ${a.replace(' (myth)', '')} or its coat colour in any way? Answer exactly YES or NO.\n\n---\n${listing}\n---`);
    const answers = await Promise.all(
      checks.map((q) => ai.models.generateContent({ model: MODEL, contents: q })));
    audit = brief.avoid.map((a, i) => ({
      question: `mentions ${a.replace(' (myth)', '')}?`,
      answer: (answers[i].text ?? '').trim().toUpperCase().startsWith('Y') ? 'YES' : 'NO',
    }));
  }

  return NextResponse.json({
    listing, prompt, audit, model: MODEL,
    elapsed_ms: Date.now() - t0,
    penalties: pens, strategy: brief.strategy,
  });
}
