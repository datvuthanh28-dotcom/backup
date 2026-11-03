IF OBJECT_ID('ProductVariants', 'U') IS NULL
BEGIN
    CREATE TABLE ProductVariants (
        id NVARCHAR(50) PRIMARY KEY,
        product_id INT NOT NULL FOREIGN KEY REFERENCES Products(id),
        sku NVARCHAR(80) NOT NULL UNIQUE,
        color_name NVARCHAR(80) NOT NULL,
        size_name NVARCHAR(30) NOT NULL,
        price DECIMAL(18, 0) NOT NULL,
        stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
        low_stock_threshold INT NOT NULL DEFAULT 3,
        max_stock_threshold INT NOT NULL DEFAULT 20,
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_ProductVariants_Selection UNIQUE(product_id, color_name, size_name),
        CONSTRAINT CK_ProductVariants_StockLevels CHECK (low_stock_threshold >= 0 AND max_stock_threshold > low_stock_threshold)
    );
    CREATE INDEX IX_ProductVariants_Product ON ProductVariants(product_id);
END
GO

IF COL_LENGTH('OrderItems', 'variant_id') IS NULL
    ALTER TABLE OrderItems ADD variant_id NVARCHAR(50) NULL;
GO
IF COL_LENGTH('OrderItems', 'selected_size') IS NULL
    ALTER TABLE OrderItems ADD selected_size NVARCHAR(30) NULL;
GO
IF COL_LENGTH('OrderItems', 'variant_sku') IS NULL
    ALTER TABLE OrderItems ADD variant_sku NVARCHAR(80) NULL;
GO
IF COL_LENGTH('InventoryMovements', 'variant_id') IS NULL
    ALTER TABLE InventoryMovements ADD variant_id NVARCHAR(50) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_OrderItems_ProductVariants')
    ALTER TABLE OrderItems ADD CONSTRAINT FK_OrderItems_ProductVariants FOREIGN KEY (variant_id) REFERENCES ProductVariants(id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_InventoryMovements_ProductVariants')
    ALTER TABLE InventoryMovements ADD CONSTRAINT FK_InventoryMovements_ProductVariants FOREIGN KEY (variant_id) REFERENCES ProductVariants(id);
GO
