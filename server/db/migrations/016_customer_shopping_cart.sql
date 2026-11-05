IF OBJECT_ID('ShoppingCarts', 'U') IS NULL
BEGIN
    CREATE TABLE ShoppingCarts (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        customer_id NVARCHAR(50) NOT NULL,
        status NVARCHAR(20) NOT NULL CONSTRAINT DF_ShoppingCarts_Status DEFAULT 'active',
        created_at DATETIME2 NOT NULL CONSTRAINT DF_ShoppingCarts_Created DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_ShoppingCarts_Updated DEFAULT GETDATE(),
        CONSTRAINT FK_ShoppingCarts_Users FOREIGN KEY (customer_id) REFERENCES Users(id),
        CONSTRAINT CK_ShoppingCarts_Status CHECK (status IN ('active', 'converted', 'abandoned'))
    );
    CREATE UNIQUE INDEX UX_ShoppingCarts_ActiveCustomer
        ON ShoppingCarts(customer_id) WHERE status = 'active';
END
GO

IF OBJECT_ID('ShoppingCartItems', 'U') IS NULL
BEGIN
    CREATE TABLE ShoppingCartItems (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        cart_id BIGINT NOT NULL,
        product_id INT NOT NULL,
        variant_id NVARCHAR(50) NOT NULL,
        quantity INT NOT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_ShoppingCartItems_Created DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_ShoppingCartItems_Updated DEFAULT GETDATE(),
        CONSTRAINT FK_ShoppingCartItems_Carts FOREIGN KEY (cart_id) REFERENCES ShoppingCarts(id) ON DELETE CASCADE,
        CONSTRAINT FK_ShoppingCartItems_Products FOREIGN KEY (product_id) REFERENCES Products(id),
        CONSTRAINT FK_ShoppingCartItems_Variants FOREIGN KEY (variant_id) REFERENCES ProductVariants(id),
        CONSTRAINT CK_ShoppingCartItems_Quantity CHECK (quantity > 0),
        CONSTRAINT UQ_ShoppingCartItems_Variant UNIQUE (cart_id, variant_id)
    );
    CREATE INDEX IX_ShoppingCartItems_Cart ON ShoppingCartItems(cart_id);
END
GO
