/* Enrich warehouse documents without turning the coursework app into a full ERP. */

IF COL_LENGTH('InventoryDocuments', 'external_reference') IS NULL
  ALTER TABLE InventoryDocuments ADD external_reference NVARCHAR(100) NULL;
GO
IF COL_LENGTH('InventoryDocuments', 'reversed_document_id') IS NULL
  ALTER TABLE InventoryDocuments ADD reversed_document_id BIGINT NULL;
GO
IF COL_LENGTH('InventoryDocuments', 'reversed_at') IS NULL
  ALTER TABLE InventoryDocuments ADD reversed_at DATETIME2 NULL;
GO
IF COL_LENGTH('InventoryDocuments', 'reversal_reason') IS NULL
  ALTER TABLE InventoryDocuments ADD reversal_reason NVARCHAR(500) NULL;
GO

IF COL_LENGTH('InventoryDocumentItems', 'sellable_quantity') IS NULL
  ALTER TABLE InventoryDocumentItems ADD sellable_quantity INT NULL;
GO
IF COL_LENGTH('InventoryDocumentItems', 'quarantine_quantity') IS NULL
  ALTER TABLE InventoryDocumentItems ADD quarantine_quantity INT NULL;
GO
IF COL_LENGTH('InventoryDocumentItems', 'unit_cost_before') IS NULL
  ALTER TABLE InventoryDocumentItems ADD unit_cost_before DECIMAL(18,0) NULL;
GO
IF COL_LENGTH('InventoryDocumentItems', 'unit_cost_after') IS NULL
  ALTER TABLE InventoryDocumentItems ADD unit_cost_after DECIMAL(18,0) NULL;
GO

IF COL_LENGTH('InventoryMovements', 'available_before') IS NULL ALTER TABLE InventoryMovements ADD available_before INT NULL;
GO
IF COL_LENGTH('InventoryMovements', 'available_after') IS NULL ALTER TABLE InventoryMovements ADD available_after INT NULL;
GO
IF COL_LENGTH('InventoryMovements', 'reserved_before') IS NULL ALTER TABLE InventoryMovements ADD reserved_before INT NULL;
GO
IF COL_LENGTH('InventoryMovements', 'reserved_after') IS NULL ALTER TABLE InventoryMovements ADD reserved_after INT NULL;
GO
IF COL_LENGTH('InventoryMovements', 'quarantine_before') IS NULL ALTER TABLE InventoryMovements ADD quarantine_before INT NULL;
GO
IF COL_LENGTH('InventoryMovements', 'quarantine_after') IS NULL ALTER TABLE InventoryMovements ADD quarantine_after INT NULL;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_InventoryDocuments_status')
  ALTER TABLE InventoryDocuments DROP CONSTRAINT CK_InventoryDocuments_status;
GO
ALTER TABLE InventoryDocuments WITH CHECK ADD CONSTRAINT CK_InventoryDocuments_status
  CHECK (status IN ('draft','pending','completed','rejected','cancelled','reversed'));

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_InventoryDocuments_type')
  ALTER TABLE InventoryDocuments DROP CONSTRAINT CK_InventoryDocuments_type;

ALTER TABLE InventoryDocuments WITH CHECK ADD CONSTRAINT CK_InventoryDocuments_type
  CHECK (document_type IN ('receipt','stocktake','quarantine','release','special_adjustment','reversal'));
GO
