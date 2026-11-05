IF COL_LENGTH('Orders', 'data_origin') IS NULL
    ALTER TABLE Orders ADD data_origin NVARCHAR(20) NOT NULL
        CONSTRAINT DF_Orders_DataOrigin DEFAULT 'actual';
IF COL_LENGTH('Orders', 'scenario_tag') IS NULL
    ALTER TABLE Orders ADD scenario_tag NVARCHAR(80) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_Orders_DataOrigin')
    ALTER TABLE Orders ADD CONSTRAINT CK_Orders_DataOrigin
        CHECK (data_origin IN ('actual','simulated'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Orders_DataOriginDate' AND object_id=OBJECT_ID('Orders'))
    CREATE INDEX IX_Orders_DataOriginDate ON Orders(data_origin,created_at)
        INCLUDE(order_status,total_amount,recognized_at);
GO

