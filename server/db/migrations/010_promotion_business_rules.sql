-- Business controls for promotions. Idempotent and safe for existing Maison Rue data.
IF COL_LENGTH('ProductVariants', 'cost_price') IS NULL
    ALTER TABLE ProductVariants ADD cost_price DECIMAL(18,0) NULL;
IF COL_LENGTH('ProductVariants', 'floor_price') IS NULL
    ALTER TABLE ProductVariants ADD floor_price DECIMAL(18,0) NULL;
GO

IF COL_LENGTH('Promotions', 'business_goal') IS NULL
    ALTER TABLE Promotions ADD business_goal NVARCHAR(40) NOT NULL CONSTRAINT DF_Promotions_BusinessGoal DEFAULT 'revenue_growth';
IF COL_LENGTH('Promotions', 'budget_total') IS NULL
    ALTER TABLE Promotions ADD budget_total DECIMAL(18,0) NULL;
IF COL_LENGTH('Promotions', 'budget_reserved') IS NULL
    ALTER TABLE Promotions ADD budget_reserved DECIMAL(18,0) NOT NULL CONSTRAINT DF_Promotions_BudgetReserved DEFAULT 0;
IF COL_LENGTH('Promotions', 'budget_spent') IS NULL
    ALTER TABLE Promotions ADD budget_spent DECIMAL(18,0) NOT NULL CONSTRAINT DF_Promotions_BudgetSpent DEFAULT 0;
IF COL_LENGTH('Promotions', 'max_discount_per_order') IS NULL
    ALTER TABLE Promotions ADD max_discount_per_order DECIMAL(18,0) NULL;
IF COL_LENGTH('Promotions', 'approval_status') IS NULL
    ALTER TABLE Promotions ADD approval_status NVARCHAR(20) NOT NULL CONSTRAINT DF_Promotions_Approval DEFAULT 'pending';
IF COL_LENGTH('Promotions', 'approved_by') IS NULL
    ALTER TABLE Promotions ADD approved_by NVARCHAR(120) NULL;
IF COL_LENGTH('Promotions', 'approved_at') IS NULL
    ALTER TABLE Promotions ADD approved_at DATETIME2 NULL;
IF COL_LENGTH('Promotions', 'approval_note') IS NULL
    ALTER TABLE Promotions ADD approval_note NVARCHAR(500) NULL;
IF COL_LENGTH('Promotions', 'requires_override') IS NULL
    ALTER TABLE Promotions ADD requires_override BIT NOT NULL CONSTRAINT DF_Promotions_RequiresOverride DEFAULT 0;
IF COL_LENGTH('Promotions', 'override_reason') IS NULL
    ALTER TABLE Promotions ADD override_reason NVARCHAR(500) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_Promotions_Budget')
    ALTER TABLE Promotions ADD CONSTRAINT CK_Promotions_Budget CHECK (
      budget_total IS NULL OR (budget_total >= 0 AND budget_reserved >= 0 AND budget_spent >= 0)
    );
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_Promotions_Approval')
    ALTER TABLE Promotions ADD CONSTRAINT CK_Promotions_Approval CHECK (approval_status IN ('pending','approved','rejected'));
GO

IF COL_LENGTH('PromotionUsages', 'budget_status') IS NULL
    ALTER TABLE PromotionUsages ADD budget_status NVARCHAR(20) NOT NULL CONSTRAINT DF_PromotionUsages_BudgetStatus DEFAULT 'reserved';
IF COL_LENGTH('PromotionUsages', 'budget_amount') IS NULL
    ALTER TABLE PromotionUsages ADD budget_amount DECIMAL(18,0) NOT NULL CONSTRAINT DF_PromotionUsages_BudgetAmount DEFAULT 0;
GO

IF COL_LENGTH('OrderItems', 'unit_cost_snapshot') IS NULL
    ALTER TABLE OrderItems ADD unit_cost_snapshot DECIMAL(18,0) NULL;
GO

-- Existing active programs are treated as approved so the migration does not interrupt sales.
UPDATE Promotions SET approval_status='approved', approved_at=COALESCE(approved_at,created_at), approved_by=COALESCE(approved_by,N'Hệ thống chuyển đổi')
WHERE status='active' AND approval_status='pending';
GO
