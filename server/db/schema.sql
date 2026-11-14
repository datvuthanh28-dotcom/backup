-- ============================================================
-- MAISON RUE LUXURY E-COMMERCE DATABASE SCHEMA (Microsoft SQL Server)
-- ============================================================

-- 1. USERS TABLE (Role-Based Access Control)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
BEGIN
    CREATE TABLE Users (
        id NVARCHAR(50) PRIMARY KEY,
        name NVARCHAR(120) NOT NULL,
        email NVARCHAR(150) NOT NULL UNIQUE,
        password_hash NVARCHAR(255) NOT NULL,
        role NVARCHAR(20) NOT NULL CHECK (role IN ('customer', 'staff', 'admin')),
        phone NVARCHAR(30),
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );

    CREATE NONCLUSTERED INDEX IX_Users_Email ON Users(email);
    CREATE NONCLUSTERED INDEX IX_Users_Role ON Users(role);
END
GO

-- 2. PRODUCTS TABLE
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Products')
BEGIN
    CREATE TABLE Products (
        id INT PRIMARY KEY,
        product_code NVARCHAR(30) NOT NULL UNIQUE,
        name NVARCHAR(150) NOT NULL,
        price DECIMAL(18, 0) NOT NULL,
        category NVARCHAR(50) NOT NULL,
        gender NVARCHAR(20) NOT NULL,
        images_json NVARCHAR(MAX) NOT NULL,
        colors_json NVARCHAR(MAX) NOT NULL,
        color_images_json NVARCHAR(MAX) NOT NULL,
        description NVARCHAR(MAX) NOT NULL,
        stock INT NOT NULL DEFAULT 0,
        min_alert INT NOT NULL DEFAULT 5,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );

    CREATE NONCLUSTERED INDEX IX_Products_Category ON Products(category);
END
GO

-- 3. ORDERS TABLE
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Orders')
BEGIN
    CREATE TABLE Orders (
        id NVARCHAR(50) PRIMARY KEY,
        customer_id NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES Users(id),
        customer_name NVARCHAR(120) NOT NULL,
        customer_email NVARCHAR(150) NOT NULL,
        customer_phone NVARCHAR(30) NOT NULL,
        shipping_address NVARCHAR(300) NOT NULL,
        shipping_fee DECIMAL(18, 0) NOT NULL DEFAULT 0,
        total_amount DECIMAL(18, 0) NOT NULL,
        order_status NVARCHAR(30) NOT NULL CHECK (order_status IN ('pending', 'confirmed', 'processing', 'shipping', 'delivered', 'cancelled')),
        stock_deducted BIT NOT NULL DEFAULT 1,
        notes NVARCHAR(500),
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );

    CREATE NONCLUSTERED INDEX IX_Orders_Customer ON Orders(customer_id);
    CREATE NONCLUSTERED INDEX IX_Orders_Status ON Orders(order_status);
    CREATE NONCLUSTERED INDEX IX_Orders_CreatedAt ON Orders(created_at);
END
GO

-- 4. ORDER ITEMS TABLE
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OrderItems')
BEGIN
    CREATE TABLE OrderItems (
        id INT IDENTITY(1,1) PRIMARY KEY,
        order_id NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES Orders(id) ON DELETE CASCADE,
        product_id INT NOT NULL FOREIGN KEY REFERENCES Products(id),
        product_name NVARCHAR(150) NOT NULL,
        selected_color NVARCHAR(50) NOT NULL,
        quantity INT NOT NULL CHECK (quantity > 0),
        unit_price DECIMAL(18, 0) NOT NULL,
        total_price DECIMAL(18, 0) NOT NULL,
        image_url NVARCHAR(300),
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );

    CREATE NONCLUSTERED INDEX IX_OrderItems_OrderId ON OrderItems(order_id);
END
GO

-- 5. ORDER STATUS HISTORY TABLE (Audit Trail)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OrderStatusHistory')
BEGIN
    CREATE TABLE OrderStatusHistory (
        id INT IDENTITY(1,1) PRIMARY KEY,
        order_id NVARCHAR(50) NOT NULL FOREIGN KEY REFERENCES Orders(id) ON DELETE CASCADE,
        previous_status NVARCHAR(30),
        new_status NVARCHAR(30) NOT NULL,
        note NVARCHAR(500),
        updated_by NVARCHAR(120) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );

    CREATE NONCLUSTERED INDEX IX_OrderStatusHistory_OrderId ON OrderStatusHistory(order_id);
END
GO

-- 6. INVENTORY MOVEMENTS TABLE (Stock Audit Ledger)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InventoryMovements')
BEGIN
    CREATE TABLE InventoryMovements (
        id INT IDENTITY(1,1) PRIMARY KEY,
        product_id INT NOT NULL FOREIGN KEY REFERENCES Products(id),
        movement_type NVARCHAR(40) NOT NULL CHECK (movement_type IN (
            'order_deduction', 'order_cancellation_restore', 'order_reservation',
            'order_cancelled_awaiting_return', 'reservation_release',
            'manual_adjustment', 'threshold_adjustment', 'restock',
            'return_restock', 'exchange_deduction', 'initial_stock',
            'product_deactivated', 'product_restored', 'sku_deactivated',
            'sku_restored', 'receipt', 'stocktake_adjustment',
            'special_adjustment', 'quarantine_hold', 'quarantine_release',
            'document_reversal'
        )),
        quantity_change INT NOT NULL,
        resulting_stock INT NOT NULL,
        reference_id NVARCHAR(50),
        note NVARCHAR(500),
        performed_by NVARCHAR(120) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );

    CREATE NONCLUSTERED INDEX IX_InventoryMovements_ProductId ON InventoryMovements(product_id);
    CREATE NONCLUSTERED INDEX IX_InventoryMovements_CreatedAt ON InventoryMovements(created_at);
END
GO

-- 7. PAYMENTS TABLE (Verified Revenue Tracking & Refund Workflow)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Payments')
BEGIN
    CREATE TABLE Payments (
        id INT IDENTITY(1,1) PRIMARY KEY,
        order_id NVARCHAR(50) NOT NULL UNIQUE FOREIGN KEY REFERENCES Orders(id) ON DELETE CASCADE,
        payment_method NVARCHAR(50) NOT NULL CHECK (payment_method IN ('cod', 'bank_transfer', 'credit_card')),
        amount DECIMAL(18, 0) NOT NULL,
        payment_status NVARCHAR(30) NOT NULL CHECK (payment_status IN ('unpaid', 'pending_verification', 'paid', 'refund_pending', 'refunded', 'cancelled')),
        verified_at DATETIME2,
        verified_by NVARCHAR(120),
        transaction_reference NVARCHAR(100),
        refunded_at DATETIME2,
        refunded_by NVARCHAR(120),
        refund_note NVARCHAR(500),
        refund_reference NVARCHAR(100),
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
    );

    CREATE NONCLUSTERED INDEX IX_Payments_OrderId ON Payments(order_id);
    CREATE NONCLUSTERED INDEX IX_Payments_Status ON Payments(payment_status);
END
GO

