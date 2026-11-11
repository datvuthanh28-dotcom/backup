IF OBJECT_ID('RevenueTargets','U') IS NULL
BEGIN
  CREATE TABLE RevenueTargets (
    period_key NVARCHAR(120) NOT NULL PRIMARY KEY,
    period_label NVARCHAR(150) NULL,
    target_revenue DECIMAL(18,0) NOT NULL,
    target_gross_profit DECIMAL(18,0) NULL,
    note NVARCHAR(500) NULL,
    updated_by NVARCHAR(100) NULL,
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END;
GO
