/* Existing clients receive their latest order address as a saved default.
   New clients receive their first address as default in customerController. */
;WITH latest_order AS (
  SELECT customer_id, shipping_address,
         ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC, id DESC) AS sequence
  FROM Orders
  WHERE shipping_address IS NOT NULL AND LTRIM(RTRIM(shipping_address)) <> ''
)
INSERT INTO CustomerAddresses(user_id, address_text, is_default, is_active)
SELECT source.customer_id, source.shipping_address, 1, 1
FROM latest_order source
WHERE source.sequence = 1
  AND NOT EXISTS (
    SELECT 1 FROM CustomerAddresses existing
    WHERE existing.user_id = source.customer_id AND existing.is_active = 1
  );
