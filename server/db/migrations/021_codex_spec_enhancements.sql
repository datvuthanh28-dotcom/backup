-- Migration 021: Codex Specification Enhancements
-- 1. Product & SKU Soft Delete, Audit, and Restoration Tracking
-- 2. Customer Review Versioning, Admin-Hide Preservation, and Weekly AI Audit Runs
-- 3. Review Moderation History & Audit Trail

-- ----------------------------------------------------
-- 1. Products Columns
-- ----------------------------------------------------
IF OBJECT_ID('Products', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('Products') AND name='created_by')
BEGIN
  ALTER TABLE Products ADD created_by NVARCHAR(100) NULL;
END
GO

IF OBJECT_ID('Products', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('Products') AND name='updated_by')
BEGIN
  ALTER TABLE Products ADD updated_by NVARCHAR(100) NULL;
END
GO

IF OBJECT_ID('Products', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('Products') AND name='deactivated_at')
BEGIN
  ALTER TABLE Products ADD deactivated_at DATETIME2 NULL;
END
GO

IF OBJECT_ID('Products', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('Products') AND name='deactivated_by')
BEGIN
  ALTER TABLE Products ADD deactivated_by NVARCHAR(100) NULL;
END
GO

-- ----------------------------------------------------
-- 2. ProductVariants Columns
-- ----------------------------------------------------
IF OBJECT_ID('ProductVariants', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('ProductVariants') AND name='created_by')
BEGIN
  ALTER TABLE ProductVariants ADD created_by NVARCHAR(100) NULL;
END
GO

IF OBJECT_ID('ProductVariants', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('ProductVariants') AND name='updated_by')
BEGIN
  ALTER TABLE ProductVariants ADD updated_by NVARCHAR(100) NULL;
END
GO

IF OBJECT_ID('ProductVariants', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('ProductVariants') AND name='deactivated_at')
BEGIN
  ALTER TABLE ProductVariants ADD deactivated_at DATETIME2 NULL;
END
GO

IF OBJECT_ID('ProductVariants', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('ProductVariants') AND name='deactivated_by')
BEGIN
  ALTER TABLE ProductVariants ADD deactivated_by NVARCHAR(100) NULL;
END
GO

IF OBJECT_ID('ProductVariants', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('ProductVariants') AND name='individually_deactivated')
BEGIN
  ALTER TABLE ProductVariants ADD individually_deactivated BIT NOT NULL DEFAULT 0;
END
GO

-- ----------------------------------------------------
-- 3. ProductReviews Columns for Multi-Version & AI Audit
-- ----------------------------------------------------
IF OBJECT_ID('ProductReviews', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('ProductReviews') AND name='version')
BEGIN
  ALTER TABLE ProductReviews ADD version INT NOT NULL DEFAULT 1;
END
GO

IF OBJECT_ID('ProductReviews', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('ProductReviews') AND name='is_hidden_by_admin')
BEGIN
  ALTER TABLE ProductReviews ADD is_hidden_by_admin BIT NOT NULL DEFAULT 0;
END
GO

IF OBJECT_ID('ProductReviews', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('ProductReviews') AND name='audit_status')
BEGIN
  ALTER TABLE ProductReviews ADD audit_status NVARCHAR(50) NOT NULL DEFAULT 'pending_audit';
END
GO

IF OBJECT_ID('ProductReviews', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('ProductReviews') AND name='ai_analysis_json')
BEGIN
  ALTER TABLE ProductReviews ADD ai_analysis_json NVARCHAR(MAX) NULL;
END
GO

IF OBJECT_ID('ProductReviews', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('ProductReviews') AND name='ai_version_analyzed')
BEGIN
  ALTER TABLE ProductReviews ADD ai_version_analyzed INT NULL;
END
GO

IF OBJECT_ID('ProductReviews', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('ProductReviews') AND name='ai_error')
BEGIN
  ALTER TABLE ProductReviews ADD ai_error NVARCHAR(MAX) NULL;
END
GO

IF OBJECT_ID('ProductReviews', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('ProductReviews') AND name='ai_audit_run_id')
BEGIN
  ALTER TABLE ProductReviews ADD ai_audit_run_id INT NULL;
END
GO

-- ----------------------------------------------------
-- 4. ReviewAuditRuns Table (Batch Audit Records)
-- ----------------------------------------------------
IF OBJECT_ID('ReviewAuditRuns', 'U') IS NULL
BEGIN
  CREATE TABLE ReviewAuditRuns (
    id INT IDENTITY(1,1) PRIMARY KEY,
    run_type NVARCHAR(50) NOT NULL, -- 'scheduled', 'manual_admin'
    status NVARCHAR(50) NOT NULL, -- 'running', 'completed', 'failed', 'empty'
    started_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    completed_at DATETIME2 NULL,
    total_reviews INT NOT NULL DEFAULT 0,
    clean_count INT NOT NULL DEFAULT 0,
    flagged_count INT NOT NULL DEFAULT 0,
    error_count INT NOT NULL DEFAULT 0,
    summary_json NVARCHAR(MAX) NULL,
    error_message NVARCHAR(MAX) NULL,
    performed_by NVARCHAR(100) NULL
  );
END
GO

-- ----------------------------------------------------
-- 5. ReviewModerationHistory Table (Audit Log of Admin Decisions)
-- ----------------------------------------------------
IF OBJECT_ID('ReviewModerationHistory', 'U') IS NULL
BEGIN
  CREATE TABLE ReviewModerationHistory (
    id INT IDENTITY(1,1) PRIMARY KEY,
    review_id INT NOT NULL,
    action NVARCHAR(50) NOT NULL, -- 'keep', 'hide', 'restore', 'bulk_keep', 'bulk_hide', 'bulk_restore'
    previous_status NVARCHAR(50) NOT NULL,
    new_status NVARCHAR(50) NOT NULL,
    reason NVARCHAR(MAX) NULL,
    performed_by NVARCHAR(100) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO

-- ----------------------------------------------------
-- 6. InventoryMovements Check Constraint Update
-- ----------------------------------------------------
IF OBJECT_ID('InventoryMovements', 'U') IS NOT NULL
BEGIN
  DECLARE @movementCheckName sysname;
  SELECT TOP 1 @movementCheckName=cc.name
  FROM sys.check_constraints cc
  JOIN sys.columns c ON c.object_id=cc.parent_object_id AND c.column_id=cc.parent_column_id
  WHERE cc.parent_object_id=OBJECT_ID('InventoryMovements') AND c.name='movement_type';

  IF @movementCheckName IS NOT NULL
    EXEC(N'ALTER TABLE InventoryMovements DROP CONSTRAINT [' + @movementCheckName + N']');

  ALTER TABLE InventoryMovements ADD CONSTRAINT CK_InventoryMovements_MovementType
    CHECK (movement_type IN (
      'order_deduction',
      'order_cancellation_restore',
      'manual_adjustment',
      'restock',
      'return_restock',
      'exchange_deduction',
      'initial_stock',
      'product_deactivated',
      'product_restored',
      'sku_deactivated',
      'sku_restored'
    ));
END
GO
