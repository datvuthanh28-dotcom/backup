-- Keep the inventory audit constraint aligned with every movement emitted by
-- the order, catalogue and warehouse-document workflows.
-- This migration is intentionally idempotent because the project migration
-- runner replays SQL files when setting up another developer's database.
IF OBJECT_ID('dbo.InventoryMovements', 'U') IS NOT NULL
BEGIN
  DECLARE @constraintName sysname;

  WHILE 1 = 1
  BEGIN
    SET @constraintName = NULL;
    SELECT TOP (1) @constraintName = cc.name
    FROM sys.check_constraints cc
    JOIN sys.columns c
      ON c.object_id = cc.parent_object_id
     AND c.column_id = cc.parent_column_id
    WHERE cc.parent_object_id = OBJECT_ID('dbo.InventoryMovements')
      AND c.name = 'movement_type';

    IF @constraintName IS NULL BREAK;
    EXEC(N'ALTER TABLE dbo.InventoryMovements DROP CONSTRAINT [' + @constraintName + N']');
  END

  ALTER TABLE dbo.InventoryMovements WITH CHECK
    ADD CONSTRAINT CK_InventoryMovements_MovementType CHECK (movement_type IN (
      'order_deduction',
      'order_cancellation_restore',
      'order_reservation',
      'order_cancelled_awaiting_return',
      'reservation_release',
      'manual_adjustment',
      'threshold_adjustment',
      'restock',
      'return_restock',
      'exchange_deduction',
      'initial_stock',
      'product_deactivated',
      'product_restored',
      'sku_deactivated',
      'sku_restored',
      'receipt',
      'stocktake_adjustment',
      'special_adjustment',
      'quarantine_hold',
      'quarantine_release',
      'document_reversal'
    ));
END
GO
