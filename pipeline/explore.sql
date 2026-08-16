-- Local validation of the analytics on DuckDB before porting to Snowflake.
-- Same shape of SQL; only the date-diff spelling differs.

CREATE OR REPLACE TABLE intakes AS
  SELECT * FROM read_csv_auto('data/intakes.csv', header=true, all_varchar=true);
CREATE OR REPLACE TABLE outcomes AS
  SELECT * FROM read_csv_auto('data/outcomes.csv', header=true, all_varchar=true);

-- An animal can pass through the shelter many times. Pair the Nth intake with
-- the Nth outcome per animal, which is how this dataset is meant to be read.
CREATE OR REPLACE TABLE stays AS
WITH i AS (
  SELECT animal_id, name,
         CAST(datetime AS TIMESTAMP) AS intake_ts,
         intake_type, intake_condition, animal_type,
         sex_upon_intake, breed, color, found_location,
         ROW_NUMBER() OVER (PARTITION BY animal_id ORDER BY CAST(datetime AS TIMESTAMP)) AS seq
  FROM intakes
),
o AS (
  SELECT animal_id,
         CAST(datetime AS TIMESTAMP) AS outcome_ts,
         outcome_type, outcome_subtype,
         TRY_CAST(date_of_birth AS DATE) AS dob,
         ROW_NUMBER() OVER (PARTITION BY animal_id ORDER BY CAST(datetime AS TIMESTAMP)) AS seq
  FROM outcomes
)
SELECT
  i.animal_id, i.name, i.seq AS stay_no,
  i.intake_ts, o.outcome_ts,
  i.intake_type, i.intake_condition, i.animal_type,
  i.sex_upon_intake, i.breed, i.color, i.found_location,
  o.outcome_type, o.outcome_subtype, o.dob,
  DATE_DIFF('day', i.intake_ts, o.outcome_ts) AS los_days,
  DATE_DIFF('day', o.dob, CAST(i.intake_ts AS DATE)) / 365.25 AS age_years_at_intake,
  -- "Black/White" -> "Black"; the first colour is the dominant one
  SPLIT_PART(i.color, '/', 1) AS primary_color,
  CASE WHEN LOWER(i.breed) LIKE '%pit bull%' THEN 1 ELSE 0 END AS is_pit_bull
FROM i JOIN o ON i.animal_id = o.animal_id AND i.seq = o.seq
WHERE o.outcome_ts >= i.intake_ts;

.print '--- scale ---'
SELECT
  (SELECT COUNT(*) FROM intakes)  AS intake_rows,
  (SELECT COUNT(*) FROM outcomes) AS outcome_rows,
  (SELECT COUNT(*) FROM stays)    AS paired_stays,
  (SELECT COUNT(*) FROM stays WHERE animal_type='Dog') AS dog_stays;

.print '--- outcome mix for dogs ---'
SELECT outcome_type, COUNT(*) n, ROUND(100.0*COUNT(*)/SUM(COUNT(*)) OVER (),1) pct
FROM stays WHERE animal_type='Dog' GROUP BY 1 ORDER BY n DESC;

.print '--- FOLKLORE 1: do black dogs wait longer to be adopted? ---'
SELECT primary_color,
       COUNT(*) n,
       ROUND(AVG(los_days),1) avg_days,
       ROUND(MEDIAN(los_days),1) median_days
FROM stays
WHERE animal_type='Dog' AND outcome_type='Adoption' AND los_days BETWEEN 0 AND 365
GROUP BY 1 HAVING COUNT(*) >= 300
ORDER BY median_days DESC;

.print '--- FOLKLORE 2: the pit bull penalty ---'
SELECT is_pit_bull, COUNT(*) n,
       ROUND(AVG(los_days),1) avg_days, ROUND(MEDIAN(los_days),1) median_days
FROM stays
WHERE animal_type='Dog' AND outcome_type='Adoption' AND los_days BETWEEN 0 AND 365
GROUP BY 1;

.print '--- FOLKLORE 3: age ---'
SELECT CASE WHEN age_years_at_intake < 0.5 THEN 'a. under 6mo'
            WHEN age_years_at_intake < 2   THEN 'b. 6mo-2y'
            WHEN age_years_at_intake < 5   THEN 'c. 2-5y'
            WHEN age_years_at_intake < 8   THEN 'd. 5-8y'
            ELSE 'e. 8y+' END AS age_band,
       COUNT(*) n, ROUND(AVG(los_days),1) avg_days, ROUND(MEDIAN(los_days),1) median_days
FROM stays
WHERE animal_type='Dog' AND outcome_type='Adoption'
  AND los_days BETWEEN 0 AND 365 AND age_years_at_intake BETWEEN 0 AND 25
GROUP BY 1 ORDER BY 1;
