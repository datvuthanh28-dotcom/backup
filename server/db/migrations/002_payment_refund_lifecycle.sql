-- ============================================================
-- MIGRATION 002: PAYMENT & REFUND INDEPENDENT LIFECYCLE
-- Decouples order status and payment status, enables refund workflow
-- ============================================================

-- 1. Drop old payment_status check constraint dynamically
DECLARE @ConstraintName NVARCHAR(200);
SELECT @ConstraintName = name 
FROM sys.check_constraints 
WHERE parent_object_id = OBJECT_ID('Payments') 
  AND definition LIKE '%payment_status%';

IF @ConstraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE Payments DROP CONSTRAINT ' + @ConstraintName);
    PRINT 'Dropped old constraint: ' + @ConstraintName;
END
GO

-- 2. Add new payment_status check constraint supporting 'refund_pending' and 'cancelled'
IF NOT EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_Payments_Status')
BEGIN
    ALTER TABLE Payments 
    ADD CONSTRAINT CK_Payments_Status 
    CHECK (payment_status IN ('unpaid', 'pending_verification', 'paid', 'refund_pending', 'refunded', 'cancelled'));
    PRINT 'Added CK_Payments_Status with full refund lifecycle support.';
END
GO

-- 3. Add refund audit columns if not exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Payments') AND name = 'refunded_at')
BEGIN
    ALTER TABLE Payments ADD refunded_at DATETIME2 NULL;
    PRINT 'Added column Payments.refunded_at';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Payments') AND name = 'refunded_by')
BEGIN
    ALTER TABLE Payments ADD refunded_by NVARCHAR(120) NULL;
    PRINT 'Added column Payments.refunded_by';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Payments') AND name = 'refund_note')
BEGIN
    ALTER TABLE Payments ADD refund_note NVARCHAR(500) NULL;
    PRINT 'Added column Payments.refund_note';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Payments') AND name = 'refund_reference')
BEGIN
    ALTER TABLE Payments ADD refund_reference NVARCHAR(100) NULL;
    PRINT 'Added column Payments.refund_reference';
END
GO
