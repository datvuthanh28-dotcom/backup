IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='ReturnRequests')
BEGIN
  CREATE TABLE ReturnRequests (
    id NVARCHAR(40) NOT NULL PRIMARY KEY,
    order_id NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES Orders(id),
    order_item_id INT NOT NULL FOREIGN KEY REFERENCES OrderItems(id),
    customer_id NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES Users(id),
    request_type NVARCHAR(20) NOT NULL CHECK (request_type IN ('refund','exchange')),
    reason_code NVARCHAR(40) NOT NULL,
    reason_detail NVARCHAR(1000) NULL,
    requested_quantity INT NOT NULL CHECK (requested_quantity > 0),
    exchange_size NVARCHAR(50) NULL,
    exchange_color NVARCHAR(50) NULL,
    requested_amount DECIMAL(18,0) NOT NULL DEFAULT 0,
    status NVARCHAR(30) NOT NULL CHECK (status IN ('auto_approved','auto_declined','manual_review','return_authorized','in_transit','received','inspection_passed','inspection_failed','refunded','exchanged','cancelled')),
    decision_reason NVARCHAR(500) NOT NULL,
    return_deadline DATETIME2 NULL,
    return_received_at DATETIME2 NULL,
    inspection_note NVARCHAR(1000) NULL,
    resolution_note NVARCHAR(1000) NULL,
    refund_reference NVARCHAR(100) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_ReturnRequests_Customer ON ReturnRequests(customer_id, created_at DESC);
  CREATE INDEX IX_ReturnRequests_Order ON ReturnRequests(order_id, order_item_id);
  CREATE INDEX IX_ReturnRequests_Status ON ReturnRequests(status, created_at DESC);
END
GO
