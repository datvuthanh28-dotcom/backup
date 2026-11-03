IF COL_LENGTH('Products', 'product_code') IS NULL
BEGIN
    ALTER TABLE Products ADD product_code NVARCHAR(30) NULL;
END
GO

UPDATE Products
SET product_code = CONCAT('MR-', RIGHT(CONCAT('000', CAST(id AS VARCHAR(10))), 3))
WHERE product_code IS NULL OR LTRIM(RTRIM(product_code)) = '';
GO

IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID('Products')
      AND name = 'product_code'
      AND is_nullable = 1
)
BEGIN
    ALTER TABLE Products ALTER COLUMN product_code NVARCHAR(30) NOT NULL;
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID('Products')
      AND name = 'UQ_Products_ProductCode'
)
BEGIN
    CREATE UNIQUE INDEX UQ_Products_ProductCode ON Products(product_code);
END
GO
