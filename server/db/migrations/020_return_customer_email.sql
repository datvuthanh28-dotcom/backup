IF OBJECT_ID('ReturnRequests', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('ReturnRequests') AND name='customer_email')
BEGIN
  ALTER TABLE ReturnRequests ADD customer_email NVARCHAR(255) NULL;
END
GO

