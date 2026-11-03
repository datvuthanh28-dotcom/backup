IF COL_LENGTH('ProductVariants', 'max_stock_threshold') IS NULL
BEGIN
    ALTER TABLE ProductVariants
    ADD max_stock_threshold INT NOT NULL
        CONSTRAINT DF_ProductVariants_MaxStockThreshold DEFAULT 20;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_ProductVariants_StockLevels'
)
BEGIN
    ALTER TABLE ProductVariants WITH CHECK
    ADD CONSTRAINT CK_ProductVariants_StockLevels
        CHECK (low_stock_threshold >= 0 AND max_stock_threshold > low_stock_threshold);
END
GO
