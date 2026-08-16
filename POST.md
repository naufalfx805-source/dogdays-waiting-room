---
title: Everybody knows black dogs wait longer. 347,587 shelter records disagree.
published: false
tags: devchallenge, weekendchallenge, snowflake, ai
---

*This is a submission for [Weekend Challenge: Dog Days Edition](https://dev.to/challenges/weekend-2026-08-13)*

## What I Built

**The Waiting Room** — I loaded every animal intake and outcome Austin Animal Center has ever
published into Snowflake, reconstructed how long each dog actually sat in the shelter, and used it
to test the most repeated piece of folklore in animal rescue.

*Black dog syndrome* is the belief that dark-coated dogs wait far longer to be adopted than light
ones. Shelters repeat it. Some run black-dog promotions because of it. I had never seen anyone
check it against a large public dataset, so I did.

Here is the answer, from 46,749 real dog adoptions:

| | median days to adoption |
|---|---|
| Black dogs | **9** |
| Every other colour | **9** |

Not a small gap. **No gap.** And black dogs are the single largest group in the data — 12,727
adoptions — so this isn't a sample-size problem.

But the story didn't end there, and the second half is why I kept going.

## Demo

**[LIVE_URL_PLACEHOLDER]**

The page walks through the analysis, then ends on something I think is more useful than another
chart: pick a **real dog** from the dataset who waited a month or more, and the app computes that
specific dog's measured disadvantage in SQL, then has Gemini write its adoption listing to argue
against *that* — and to stay silent about the thing everybody assumes is the problem.

![The Waiting Room](SCREENSHOT_1)

## Code

{% embed https://github.com/naufalfx805-source/dogdays-waiting-room %}

## How I Built It

### Getting 347,587 rows into Snowflake

Austin Animal Center publishes two Socrata datasets — 173,812 intakes and 173,775 outcomes.
`pipeline/fetch.sh` pulls both as CSV (~56 MB), then `pipeline/load.mjs` stages and loads them:

```js
await step(`PUT ${name}.csv`,
  `PUT file://${ROOT}/data/${name}.csv @raw_stage AUTO_COMPRESS=TRUE OVERWRITE=TRUE`);
await step(`COPY INTO ${name}`,
  `COPY INTO ${name} FROM @raw_stage/${name}.csv.gz FILE_FORMAT=(FORMAT_NAME=csv_fmt)`);
```

### The join that bit me

The two tables have **no stay identifier**. The obvious move is to join on `animal_id` — and it is
wrong, because a dog can pass through the shelter more than once. `A006100` is in the intake table
twice in 2014 alone. Join naively and every repeat visitor becomes a cross product of all its
intakes against all its outcomes.

The fix is to number each animal's intakes and outcomes by date and pair the nth with the nth:

```sql
WITH i AS (
  SELECT ..., ROW_NUMBER() OVER (PARTITION BY animal_id ORDER BY intake_ts) AS seq FROM intakes
), o AS (
  SELECT ..., ROW_NUMBER() OVER (PARTITION BY animal_id ORDER BY outcome_ts) AS seq FROM outcomes
)
SELECT ..., DATEDIFF(day, i.intake_ts, o.outcome_ts) AS los_days
FROM i JOIN o ON i.animal_id = o.animal_id AND i.seq = o.seq
WHERE o.outcome_ts >= i.intake_ts
```

That recovers **172,069 distinct shelter stays**, each with a real length of stay.

### Where the folklore actually comes from

Ranking coat colours by median wait, black lands mid-table next to white. But one colour genuinely
sticks out: **Blue** dogs wait 21 days, more than double the median.

"Blue" is a grey-slate coat. If you know dogs, you already know where this is going. So I asked
Snowflake what share of each colour the shelter had recorded as a pit bull:

```sql
SELECT primary_color, COUNT(*) n,
       ROUND(100.0*AVG(is_pit_bull),1) AS pct_pit_bull,
       MEDIAN(los_days) AS median_days
FROM adoptions GROUP BY 1 HAVING COUNT(*) >= 300
ORDER BY pct_pit_bull DESC;
```

**Blue is 70% pit bull** — the highest of any colour. Black is 9.5%. The colour ranking was never
measuring colour.

![Colour vs pit bull share](SCREENSHOT_2)

So I controlled for it — hold breed fixed, let colour vary:

| | pit bulls | other breeds |
|---|---|---|
| black | 31 days | 8 days |
| not black | 26 days | 8 days |

Among non-pit-bulls, black and not-black are **identical**. The colour effect is a breed effect
wearing a costume.

And here is the honest caveat, which I think is the most interesting number on the page: inside
the pit bull group, black *is* slowest — 31 days against 26. So black dog syndrome is not
invented. It is a **~5-day effect living inside a 19-day breed effect**, and the folklore credits
it with the entire gap.

What actually predicts the wait is breed (27 days vs 8) and age (6 days for a puppy, 19 for a
senior). Both roughly 3×. Colour, on its own, does nothing.

### Best Use of Google AI: letting SQL decide what the model argues

The easy version of this feature is "ask Gemini to write a cute bio." That would have been
decoration. The finding above suggests something better.

If a shelter writes *"don't overlook me because of my black coat"*, it spends the listing
defending against a disadvantage that **does not exist** — and repeats the myth to every person
who reads it. Meanwhile the real 19-day problem goes unaddressed.

So the warehouse decides the argument and Gemini only executes it. `app/lib/penalty.ts` turns one
dog plus the aggregates into a list of factors, each flagged real or myth, and the prompt says:

```
STRATEGY (decided by the data, not by you)
  Lead against: breed + age.
  Do NOT apologise for, excuse, or even mention: colour (myth).
  The data shows it makes no difference, and repeating the myth spreads it.
```

Then a **second, closed-question call** verifies the constraint held:

```
Does the text below mention the dog's coat colour in any way? Answer exactly YES or NO.
```

That two-call shape is deliberate. In an earlier project I found these models answer open-ended
review questions ("is this good?") with confident, invented reasoning, but answer closed
constraint questions about a specific text correctly and instantly. So the model gets the writing
job and a yes/no audit — never an open-ended judgement call.

GEMINI_OUTPUT_PLACEHOLDER

### Charts

No chart library. The three figures are hand-written inline SVG with a hover layer, direct value
labels, a table view behind a `<details>` for screen readers, and a two-colour categorical palette
I validated for colour-vision deficiency before using it — which felt appropriate for a post about
misreading what a coat colour means.

## Prize Categories

**Best Use of Snowflake** — Snowflake is the whole analysis, not a storage layer. 347,587 raw rows
staged and `COPY INTO`'d, `ROW_NUMBER()` window functions to reconstruct 172,069 stays from tables
with no stay key, and five materialised aggregate tables that the app queries live on every page
load. The confound that makes the story — 70% of blue dogs being pit bulls — is a single
`GROUP BY` that would have been invisible without putting the data somewhere that could join it.

**Best Use of Google AI** — Gemini writes each dog's adoption listing, but it is never asked what
makes a dog hard to adopt; SQL answers that and hands the model a brief naming the measured
penalty to lead against and the myth to stay silent about. A second closed-question call audits
that the constraint held. The AI is downstream of the finding, which is the only reason it says
anything true.

---

Data: [Austin Animal Center Intakes](https://data.austintexas.gov/Government/Austin-Animal-Center-Intakes/wter-evkm)
and [Outcomes](https://data.austintexas.gov/Government/Austin-Animal-Center-Outcomes/9t4d-g238),
public domain. Breed is the shelter's own visual identification, which is unreliable for bully
breeds — but that unreliability is the point: it is the same label adopters see, which is exactly
why it predicts the wait.
