.print '--- is "Blue" just a pit bull in disguise? share of each colour that is pit bull ---'
SELECT primary_color, COUNT(*) n,
       ROUND(100.0*AVG(is_pit_bull),1) AS pct_pit_bull,
       ROUND(MEDIAN(los_days),1) median_days
FROM stays
WHERE animal_type='Dog' AND outcome_type='Adoption' AND los_days BETWEEN 0 AND 365
GROUP BY 1 HAVING COUNT(*) >= 300
ORDER BY pct_pit_bull DESC;

.print '--- control for breed: colour effect WITHIN non-pit-bulls ---'
SELECT primary_color, COUNT(*) n, ROUND(MEDIAN(los_days),1) median_days
FROM stays
WHERE animal_type='Dog' AND outcome_type='Adoption' AND los_days BETWEEN 0 AND 365
  AND is_pit_bull = 0
GROUP BY 1 HAVING COUNT(*) >= 300
ORDER BY median_days DESC;

.print '--- control for breed: colour effect WITHIN pit bulls only ---'
SELECT primary_color, COUNT(*) n, ROUND(MEDIAN(los_days),1) median_days
FROM stays
WHERE animal_type='Dog' AND outcome_type='Adoption' AND los_days BETWEEN 0 AND 365
  AND is_pit_bull = 1
GROUP BY 1 HAVING COUNT(*) >= 100
ORDER BY median_days DESC;

.print '--- black specifically, within and across breed groups ---'
SELECT CASE WHEN is_pit_bull=1 THEN 'pit bull' ELSE 'other breed' END AS breed_grp,
       CASE WHEN primary_color='Black' THEN 'black' ELSE 'not black' END AS colour_grp,
       COUNT(*) n, ROUND(MEDIAN(los_days),1) median_days, ROUND(AVG(los_days),1) avg_days
FROM stays
WHERE animal_type='Dog' AND outcome_type='Adoption' AND los_days BETWEEN 0 AND 365
GROUP BY 1,2 ORDER BY 1,2;

.print '--- what the shelter actually calls the long-wait breeds (top 15 by median wait) ---'
SELECT breed, COUNT(*) n, ROUND(MEDIAN(los_days),1) median_days
FROM stays
WHERE animal_type='Dog' AND outcome_type='Adoption' AND los_days BETWEEN 0 AND 365
GROUP BY 1 HAVING COUNT(*) >= 200
ORDER BY median_days DESC LIMIT 15;
