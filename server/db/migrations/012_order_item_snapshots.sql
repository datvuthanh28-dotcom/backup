-- Normalize historical order-line snapshots without inventing business data.
UPDATE OrderItems
SET original_unit_price = unit_price
WHERE original_unit_price IS NULL;

UPDATE OrderItems
SET final_line_total = COALESCE(total_price, unit_price * quantity)
WHERE final_line_total IS NULL;

UPDATE oi
SET unit_cost_snapshot = pv.cost_price
FROM OrderItems oi
JOIN ProductVariants pv ON pv.id = oi.variant_id
WHERE oi.unit_cost_snapshot IS NULL
  AND pv.cost_price IS NOT NULL;
