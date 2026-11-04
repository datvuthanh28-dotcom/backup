-- Reliable revenue recognition timestamps and reporting indexes.
IF COL_LENGTH('Orders', 'delivered_at') IS NULL
    ALTER TABLE Orders ADD delivered_at DATETIME2 NULL;
IF COL_LENGTH('Orders', 'recognized_at') IS NULL
    ALTER TABLE Orders ADD recognized_at DATETIME2 NULL;
GO

-- Recover delivery timestamps for existing orders from their audit trail.
UPDATE o
SET delivered_at = COALESCE(d.delivered_at, o.updated_at)
FROM Orders o
OUTER APPLY (
    SELECT MAX(h.created_at) AS delivered_at
    FROM OrderStatusHistory h
    WHERE h.order_id = o.id AND h.new_status = 'delivered'
) d
WHERE o.order_status = 'delivered' AND o.delivered_at IS NULL;
GO

-- Revenue becomes recognizable only after both delivery and verified payment.
UPDATE o
SET recognized_at = CASE
    WHEN p.verified_at IS NULL THEN o.delivered_at
    WHEN o.delivered_at >= p.verified_at THEN o.delivered_at
    ELSE p.verified_at
END
FROM Orders o
JOIN Payments p ON p.order_id = o.id
WHERE o.order_status = 'delivered'
  AND p.payment_status = 'paid'
  AND o.recognized_at IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Orders_DeliveredAt' AND object_id = OBJECT_ID('Orders'))
    CREATE INDEX IX_Orders_DeliveredAt ON Orders(delivered_at) INCLUDE (order_status, total_amount);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Orders_RecognizedAt' AND object_id = OBJECT_ID('Orders'))
    CREATE INDEX IX_Orders_RecognizedAt ON Orders(recognized_at) INCLUDE (order_status, total_amount);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Payments_VerifiedAt' AND object_id = OBJECT_ID('Payments'))
    CREATE INDEX IX_Payments_VerifiedAt ON Payments(verified_at) INCLUDE (payment_status, amount, payment_method);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Payments_RefundedAt' AND object_id = OBJECT_ID('Payments'))
    CREATE INDEX IX_Payments_RefundedAt ON Payments(refunded_at) INCLUDE (payment_status, amount);
GO
