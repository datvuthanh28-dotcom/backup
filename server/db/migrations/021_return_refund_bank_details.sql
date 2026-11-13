IF OBJECT_ID('ReturnRequests', 'U') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('ReturnRequests') AND name='refund_bank_code')
    ALTER TABLE ReturnRequests ADD refund_bank_code NVARCHAR(20) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('ReturnRequests') AND name='refund_bank_name')
    ALTER TABLE ReturnRequests ADD refund_bank_name NVARCHAR(120) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('ReturnRequests') AND name='refund_account_number')
    ALTER TABLE ReturnRequests ADD refund_account_number NVARCHAR(34) NULL;
  IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('ReturnRequests') AND name='refund_account_holder')
    ALTER TABLE ReturnRequests ADD refund_account_holder NVARCHAR(120) NULL;
END
GO
