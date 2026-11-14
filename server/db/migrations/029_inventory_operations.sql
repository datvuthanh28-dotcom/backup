/* Maison Rue inventory operations: SKU availability, reservations and auditable documents. */

IF COL_LENGTH('ProductVariants', 'reserved_quantity') IS NULL
  ALTER TABLE ProductVariants ADD reserved_quantity INT NOT NULL CONSTRAINT DF_ProductVariants_reserved_quantity DEFAULT 0;
GO
IF COL_LENGTH('ProductVariants', 'quarantine_quantity') IS NULL
  ALTER TABLE ProductVariants ADD quarantine_quantity INT NOT NULL CONSTRAINT DF_ProductVariants_quarantine_quantity DEFAULT 0;
GO
IF COL_LENGTH('ProductVariants', 'incoming_quantity') IS NULL
  ALTER TABLE ProductVariants ADD incoming_quantity INT NOT NULL CONSTRAINT DF_ProductVariants_incoming_quantity DEFAULT 0;
GO
IF COL_LENGTH('ProductVariants', 'reorder_point') IS NULL
  ALTER TABLE ProductVariants ADD reorder_point INT NULL;
GO
IF COL_LENGTH('ProductVariants', 'lead_time_days') IS NULL
  ALTER TABLE ProductVariants ADD lead_time_days INT NOT NULL CONSTRAINT DF_ProductVariants_lead_time_days DEFAULT 7;
GO

IF COL_LENGTH('InventoryMovements', 'reason_code') IS NULL ALTER TABLE InventoryMovements ADD reason_code NVARCHAR(50) NULL;
GO
IF COL_LENGTH('InventoryMovements', 'quantity_before') IS NULL ALTER TABLE InventoryMovements ADD quantity_before INT NULL;
GO
IF COL_LENGTH('InventoryMovements', 'quantity_after') IS NULL ALTER TABLE InventoryMovements ADD quantity_after INT NULL;
GO
IF COL_LENGTH('InventoryMovements', 'product_stock_after') IS NULL ALTER TABLE InventoryMovements ADD product_stock_after INT NULL;
GO
IF COL_LENGTH('InventoryMovements', 'reference_type') IS NULL ALTER TABLE InventoryMovements ADD reference_type NVARCHAR(40) NULL;
GO
IF COL_LENGTH('InventoryMovements', 'approved_by') IS NULL ALTER TABLE InventoryMovements ADD approved_by NVARCHAR(120) NULL;
GO

IF OBJECT_ID('InventoryDocuments', 'U') IS NULL
BEGIN
  CREATE TABLE InventoryDocuments (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    document_code NVARCHAR(50) NOT NULL UNIQUE,
    document_type NVARCHAR(30) NOT NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_InventoryDocuments_status DEFAULT 'completed',
    reference_id NVARCHAR(80) NULL,
    supplier_name NVARCHAR(150) NULL,
    note NVARCHAR(500) NULL,
    created_by NVARCHAR(120) NOT NULL,
    approved_by NVARCHAR(120) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_InventoryDocuments_created_at DEFAULT GETDATE(),
    completed_at DATETIME2 NULL,
    CONSTRAINT CK_InventoryDocuments_type CHECK (document_type IN ('receipt','stocktake','quarantine','release','special_adjustment')),
    CONSTRAINT CK_InventoryDocuments_status CHECK (status IN ('draft','pending','completed','rejected','cancelled'))
  );
  CREATE INDEX IX_InventoryDocuments_TypeCreated ON InventoryDocuments(document_type, created_at DESC);
END
GO

IF OBJECT_ID('InventoryDocumentItems', 'U') IS NULL
BEGIN
  CREATE TABLE InventoryDocumentItems (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES InventoryDocuments(id),
    product_id INT NOT NULL REFERENCES Products(id),
    variant_id NVARCHAR(50) NOT NULL REFERENCES ProductVariants(id),
    expected_quantity INT NULL,
    actual_quantity INT NOT NULL,
    quantity_change INT NOT NULL,
    unit_cost DECIMAL(18,0) NULL,
    disposition NVARCHAR(30) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_InventoryDocumentItems_created_at DEFAULT GETDATE()
  );
  CREATE INDEX IX_InventoryDocumentItems_Document ON InventoryDocumentItems(document_id);
  CREATE INDEX IX_InventoryDocumentItems_Variant ON InventoryDocumentItems(variant_id);
END
GO

UPDATE ProductVariants
SET reserved_quantity = CASE WHEN reserved_quantity < 0 THEN 0 ELSE reserved_quantity END,
    quarantine_quantity = CASE WHEN quarantine_quantity < 0 THEN 0 ELSE quarantine_quantity END,
    incoming_quantity = CASE WHEN incoming_quantity < 0 THEN 0 ELSE incoming_quantity END,
    reorder_point = COALESCE(reorder_point, low_stock_threshold),
    lead_time_days = CASE WHEN lead_time_days < 1 THEN 7 ELSE lead_time_days END;
GO

