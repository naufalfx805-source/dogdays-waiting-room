# The Waiting Room

**Everybody knows black dogs wait longer. 347,587 shelter records disagree.**

A DEV Weekend Challenge: Dog Days Edition submission. It loads every intake and outcome
Austin Animal Center has published into a columnar warehouse, reconstructs each dog's actual
shelter stay, and tests the best-known piece of rescue folklore — *black dog syndrome* — against
46,749 real adoptions. Then it uses **Google Gemini** to write adoption listings that argue
against the disadvantage the data actually found, instead of the one everybody assumes.

> The published numbers were computed by the **DuckDB** path (`pipeline/explore.sql`,
> `confound.sql`, `export.sql`). A complete **Snowflake** pipeline that stages the same CSVs and
> materialises the same five aggregates ships in `pipeline/snowflake.sql` + `load.mjs` and the app
> will read from it when credentials are present — but it is not what produced these figures.

## The finding

| | median days to adoption |
|---|---|
| Black dogs | **9** |
| Every other colour | **9** |

There is no black dog penalty in this data. But the colour ranking *does* have a real signal
at the top: **Blue** coats wait 21 days. Blue is **70% pit bull** — the highest of any colour.
Control for breed and the entire colour effect collapses:

| | pit bulls | other breeds |
|---|---|---|
| black | 31 days | 8 days |
| not black | 26 days | 8 days |

So the folklore is not invented — inside the pit bull group black really is slowest — but it is
a ~5-day effect living inside a **19-day breed effect**, with the cause misattributed. What
actually decides how long a dog waits is breed (27 vs 8 days) and age (6 days for puppies,
19 for seniors).

## How it works

```
Socrata open data  ->  DuckDB    ->  Next.js  ->  Gemini
   347,587 rows        stays +        charts      listing
                       aggregates                 written to brief
                    (Snowflake pipeline optional)
```

1. `pipeline/fetch.sh` pulls both public datasets as CSV.
2. `pipeline/explore.sql` and `confound.sql` pair intakes to outcomes and run the analysis;
   `export.sql` materialises five aggregate tables and dumps them to `app/data/*.json`.
3. The Next.js app serves those aggregates and renders the story.
4. `app/lib/penalty.ts` turns one dog + the aggregates into its measured disadvantage; the
   `/api/rewrite` route hands that to Gemini as a brief.
5. Optional: `pipeline/load.mjs` PUTs the CSVs to a Snowflake stage, `COPY INTO`s them and runs
   `pipeline/snowflake.sql` to build the same five tables in Snowflake; the app reads from there
   instead when `SNOWFLAKE_*` is set.

### The join that isn't obvious

Intakes and outcomes are published as two separate tables with **no stay identifier**, and a dog
can pass through the shelter many times (`A006100` appears twice in 2014 alone). Joining on
`animal_id` gives a cross product. The fix is to number each animal's intakes and outcomes by
date and pair the nth with the nth:

```sql
ROW_NUMBER() OVER (PARTITION BY animal_id ORDER BY datetime) AS seq
...
FROM i JOIN o ON i.animal_id = o.animal_id AND i.seq = o.seq
WHERE o.outcome_ts >= i.intake_ts
```

That recovers 172,069 distinct stays from 347,587 raw rows.

### What Gemini is actually asked to do

The model is never asked what makes a dog hard to adopt — SQL answers that. It receives a brief
naming the measured penalty to lead against and the myth to stay silent about:

> Do NOT apologise for, excuse, or even mention: colour. The data shows it makes no
> difference, and repeating the myth spreads it.

A second, **closed-question** call then checks the constraint held (`Does the text mention the
dog's coat colour? YES or NO`) — open-ended self-review is unreliable in a way yes/no
constraint checks are not.

## Running it

```bash
cp .env.example .env                       # GEMINI_API_KEY for the rewriter
pipeline/fetch.sh                          # ~2 min, 56 MB
duckdb waiting.duckdb < pipeline/explore.sql   # the analysis
duckdb waiting.duckdb < pipeline/confound.sql  # the breed control
duckdb waiting.duckdb < pipeline/export.sql    # -> app/data/*.json
cd app && npm install && npm run dev
```

The aggregates are committed, so the app runs without re-running the pipeline. With no
`GEMINI_API_KEY` the listing writer is disabled in the UI rather than failing on click. To use
Snowflake instead, fill in the `SNOWFLAKE_*` keys and run `node pipeline/load.mjs`.

## Data

[Austin Animal Center Intakes](https://data.austintexas.gov/Government/Austin-Animal-Center-Intakes/wter-evkm)
and [Outcomes](https://data.austintexas.gov/Government/Austin-Animal-Center-Outcomes/9t4d-g238),
public domain.

Breed is the shelter's own visual identification, which is known to be unreliable for bully
breeds. That is a property of the label — and it is the same label adopters see, which is
precisely why it predicts the wait.
