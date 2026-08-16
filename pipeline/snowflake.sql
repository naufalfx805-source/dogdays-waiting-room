-- The Waiting Room: warehouse build.
-- Loads 347k raw Austin Animal Center rows, pairs them into stays, and
-- materialises the five aggregates the app serves.
-- Statements are separated by a line containing only ';;'.

CREATE DATABASE IF NOT EXISTS WAITING_ROOM
;;
USE DATABASE WAITING_ROOM
;;
USE SCHEMA PUBLIC
;;
CREATE OR REPLACE FILE FORMAT csv_fmt
  TYPE = CSV FIELD_OPTIONALLY_ENCLOSED_BY = '"' SKIP_HEADER = 1
  EMPTY_FIELD_AS_NULL = TRUE NULL_IF = ('', 'NULL')
;;
CREATE OR REPLACE STAGE raw_stage FILE_FORMAT = csv_fmt
;;
CREATE OR REPLACE TABLE intakes (
  animal_id STRING, name STRING, datetime STRING, datetime2 STRING,
  found_location STRING, intake_type STRING, intake_condition STRING,
  animal_type STRING, sex_upon_intake STRING, age_upon_intake STRING,
  breed STRING, color STRING
)
;;
CREATE OR REPLACE TABLE outcomes (
  animal_id STRING, date_of_birth STRING, name STRING, datetime STRING,
  monthyear STRING, outcome_type STRING, outcome_subtype STRING,
  animal_type STRING, sex_upon_outcome STRING, age_upon_outcome STRING,
  breed STRING, color STRING
)
;;
-- An animal can pass through the shelter many times, so a plain join on
-- animal_id produces a cross product. Pair the Nth intake with the Nth outcome.
CREATE OR REPLACE TABLE stays AS
WITH i AS (
  SELECT animal_id, name, TRY_TO_TIMESTAMP(datetime) AS intake_ts,
         intake_type, intake_condition, animal_type, sex_upon_intake,
         breed, color, found_location,
         ROW_NUMBER() OVER (PARTITION BY animal_id ORDER BY TRY_TO_TIMESTAMP(datetime)) AS seq
  FROM intakes
),
o AS (
  SELECT animal_id, TRY_TO_TIMESTAMP(datetime) AS outcome_ts,
         outcome_type, outcome_subtype, TRY_TO_DATE(date_of_birth) AS dob,
         ROW_NUMBER() OVER (PARTITION BY animal_id ORDER BY TRY_TO_TIMESTAMP(datetime)) AS seq
  FROM outcomes
)
SELECT i.animal_id, i.name, i.seq AS stay_no, i.intake_ts, o.outcome_ts,
       i.intake_type, i.intake_condition, i.animal_type, i.sex_upon_intake,
       i.breed, i.color, i.found_location,
       o.outcome_type, o.outcome_subtype, o.dob,
       DATEDIFF(day, i.intake_ts, o.outcome_ts) AS los_days,
       DATEDIFF(day, o.dob, TO_DATE(i.intake_ts)) / 365.25 AS age_years_at_intake,
       SPLIT_PART(i.color, '/', 1) AS primary_color,
       IFF(LOWER(i.breed) LIKE '%pit bull%', 1, 0) AS is_pit_bull
FROM i JOIN o ON i.animal_id = o.animal_id AND i.seq = o.seq
WHERE o.outcome_ts >= i.intake_ts
;;
CREATE OR REPLACE TABLE adoptions AS
SELECT * FROM stays
WHERE animal_type = 'Dog' AND outcome_type = 'Adoption' AND los_days BETWEEN 0 AND 365
;;
-- Built from CTEs rather than scalar subqueries in a FROM-less SELECT, which
-- is the portable spelling and keeps each number traceable to one aggregate.
CREATE OR REPLACE TABLE agg_headline AS
WITH raw AS (
  SELECT (SELECT COUNT(*) FROM intakes) AS intake_rows,
         (SELECT COUNT(*) FROM outcomes) AS outcome_rows
),
st AS (
  SELECT COUNT(*) AS paired_stays,
         COUNT_IF(animal_type = 'Dog') AS dog_stays
  FROM stays
),
ad AS (
  SELECT COUNT(*) AS dog_adoptions,
         MEDIAN(CASE WHEN is_pit_bull = 1 THEN los_days END)          AS pit_median,
         MEDIAN(CASE WHEN is_pit_bull = 0 THEN los_days END)          AS nonpit_median,
         MEDIAN(CASE WHEN primary_color = 'Black' THEN los_days END)  AS black_median,
         MEDIAN(CASE WHEN primary_color <> 'Black' THEN los_days END) AS nonblack_median
  FROM adoptions
)
SELECT raw.intake_rows, raw.outcome_rows, st.paired_stays, st.dog_stays,
       ad.dog_adoptions, ad.pit_median, ad.nonpit_median,
       ad.black_median, ad.nonblack_median
FROM raw, st, ad
;;
CREATE OR REPLACE TABLE agg_color AS
SELECT primary_color AS color, COUNT(*) AS n,
       MEDIAN(los_days) AS median_days,
       ROUND(AVG(los_days),1) AS avg_days,
       ROUND(100.0*AVG(is_pit_bull),1) AS pct_pit_bull
FROM adoptions GROUP BY 1 HAVING COUNT(*) >= 300
;;
CREATE OR REPLACE TABLE agg_color_controlled AS
SELECT primary_color AS color,
       IFF(is_pit_bull=1, 'pit bull', 'other breed') AS breed_group,
       COUNT(*) AS n, MEDIAN(los_days) AS median_days
FROM adoptions GROUP BY 1,2 HAVING COUNT(*) >= 100
;;
CREATE OR REPLACE TABLE agg_breed AS
SELECT breed, COUNT(*) AS n, MEDIAN(los_days) AS median_days
FROM adoptions GROUP BY 1 HAVING COUNT(*) >= 200
;;
CREATE OR REPLACE TABLE agg_age AS
SELECT CASE WHEN age_years_at_intake < 0.5 THEN 'under 6mo'
            WHEN age_years_at_intake < 2   THEN '6mo-2y'
            WHEN age_years_at_intake < 5   THEN '2-5y'
            WHEN age_years_at_intake < 8   THEN '5-8y'
            ELSE '8y+' END AS age_band,
       COUNT(*) AS n, MEDIAN(los_days) AS median_days
FROM adoptions WHERE age_years_at_intake BETWEEN 0 AND 25 GROUP BY 1
;;
CREATE OR REPLACE TABLE dogs_waiting AS
SELECT animal_id, name, breed, color, primary_color, is_pit_bull,
       ROUND(age_years_at_intake,1) AS age_years,
       sex_upon_intake, intake_condition, intake_type, los_days
FROM adoptions
WHERE name IS NOT NULL AND name <> '' AND los_days >= 30
  AND age_years_at_intake BETWEEN 0 AND 25
ORDER BY los_days DESC LIMIT 300
;;
