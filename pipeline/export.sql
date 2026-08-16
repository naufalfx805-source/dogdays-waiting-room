-- Build the aggregate tables the app reads, then dump them to JSON.
-- Snowflake produces these same five tables from the same logic (see snowflake.sql).

CREATE OR REPLACE TABLE adoptions AS
SELECT * FROM stays
WHERE animal_type='Dog' AND outcome_type='Adoption' AND los_days BETWEEN 0 AND 365;

-- 1. headline scalars
CREATE OR REPLACE TABLE agg_headline AS
SELECT
  (SELECT COUNT(*) FROM intakes)   AS intake_rows,
  (SELECT COUNT(*) FROM outcomes)  AS outcome_rows,
  (SELECT COUNT(*) FROM stays)     AS paired_stays,
  (SELECT COUNT(*) FROM stays WHERE animal_type='Dog') AS dog_stays,
  (SELECT COUNT(*) FROM adoptions) AS dog_adoptions,
  (SELECT MEDIAN(los_days) FROM adoptions WHERE is_pit_bull=1) AS pit_median,
  (SELECT MEDIAN(los_days) FROM adoptions WHERE is_pit_bull=0) AS nonpit_median,
  (SELECT MEDIAN(los_days) FROM adoptions WHERE primary_color='Black') AS black_median,
  (SELECT MEDIAN(los_days) FROM adoptions WHERE primary_color<>'Black') AS nonblack_median;

-- 2. the naive colour view (what the folklore claims)
CREATE OR REPLACE TABLE agg_color AS
SELECT primary_color AS color, COUNT(*) AS n,
       MEDIAN(los_days) AS median_days,
       ROUND(AVG(los_days),1) AS avg_days,
       ROUND(100.0*AVG(is_pit_bull),1) AS pct_pit_bull
FROM adoptions GROUP BY 1 HAVING COUNT(*) >= 300;

-- 3. the same colours, split by breed group (the confound control)
CREATE OR REPLACE TABLE agg_color_controlled AS
SELECT primary_color AS color,
       CASE WHEN is_pit_bull=1 THEN 'pit bull' ELSE 'other breed' END AS breed_group,
       COUNT(*) AS n, MEDIAN(los_days) AS median_days
FROM adoptions GROUP BY 1,2 HAVING COUNT(*) >= 100;

-- 4. breeds
CREATE OR REPLACE TABLE agg_breed AS
SELECT breed, COUNT(*) AS n, MEDIAN(los_days) AS median_days
FROM adoptions GROUP BY 1 HAVING COUNT(*) >= 200;

-- 5. age bands
CREATE OR REPLACE TABLE agg_age AS
SELECT CASE WHEN age_years_at_intake < 0.5 THEN 'under 6mo'
            WHEN age_years_at_intake < 2   THEN '6mo-2y'
            WHEN age_years_at_intake < 5   THEN '2-5y'
            WHEN age_years_at_intake < 8   THEN '5-8y'
            ELSE '8y+' END AS age_band,
       COUNT(*) AS n, MEDIAN(los_days) AS median_days
FROM adoptions WHERE age_years_at_intake BETWEEN 0 AND 25 GROUP BY 1;

-- 6. real dogs that waited a long time - the input to the Gemini rewriter
CREATE OR REPLACE TABLE dogs_waiting AS
SELECT animal_id, name, breed, color, primary_color, is_pit_bull,
       ROUND(age_years_at_intake,1) AS age_years,
       sex_upon_intake, intake_condition, intake_type, los_days
FROM adoptions
WHERE name IS NOT NULL AND name <> '' AND los_days >= 30
  AND age_years_at_intake BETWEEN 0 AND 25
ORDER BY los_days DESC LIMIT 300;

COPY (SELECT * FROM agg_headline)          TO 'app/data/headline.json'   (FORMAT JSON, ARRAY true);
COPY (SELECT * FROM agg_color ORDER BY median_days DESC)
                                            TO 'app/data/color.json'      (FORMAT JSON, ARRAY true);
COPY (SELECT * FROM agg_color_controlled ORDER BY breed_group, median_days DESC)
                                            TO 'app/data/color_controlled.json' (FORMAT JSON, ARRAY true);
COPY (SELECT * FROM agg_breed ORDER BY median_days DESC)
                                            TO 'app/data/breed.json'      (FORMAT JSON, ARRAY true);
COPY (SELECT * FROM agg_age)               TO 'app/data/age.json'        (FORMAT JSON, ARRAY true);
COPY (SELECT * FROM dogs_waiting)          TO 'app/data/dogs.json'       (FORMAT JSON, ARRAY true);
