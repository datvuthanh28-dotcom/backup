IF COL_LENGTH('dbo.Users', 'token_version') IS NULL
BEGIN
    ALTER TABLE dbo.Users
        ADD token_version INT NOT NULL CONSTRAINT DF_Users_TokenVersion DEFAULT 1;
END
GO

IF OBJECT_ID('dbo.PasswordResetOtps', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PasswordResetOtps (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id NVARCHAR(50) NOT NULL,
        email NVARCHAR(150) NOT NULL,
        otp_hash NVARCHAR(128) NOT NULL,
        attempts INT NOT NULL CONSTRAINT DF_PasswordResetOtps_Attempts DEFAULT 0,
        max_attempts INT NOT NULL CONSTRAINT DF_PasswordResetOtps_MaxAttempts DEFAULT 5,
        expires_at DATETIME2 NOT NULL,
        used_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_PasswordResetOtps_CreatedAt DEFAULT SYSUTCDATETIME()
    );

    CREATE INDEX IX_PasswordResetOtps_Email_Created
        ON dbo.PasswordResetOtps (email, created_at DESC);

    CREATE INDEX IX_PasswordResetOtps_User_Active
        ON dbo.PasswordResetOtps (user_id, used_at, expires_at DESC);
END
GO

IF OBJECT_ID('dbo.NewsletterSubscribers', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.NewsletterSubscribers (
        id INT IDENTITY(1,1) PRIMARY KEY,
        email NVARCHAR(150) NOT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_NewsletterSubscribers_Active DEFAULT 1,
        source NVARCHAR(64) NOT NULL CONSTRAINT DF_NewsletterSubscribers_Source DEFAULT 'footer',
        subscribed_at DATETIME2 NOT NULL CONSTRAINT DF_NewsletterSubscribers_SubscribedAt DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_NewsletterSubscribers_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_NewsletterSubscribers_Email UNIQUE (email)
    );
END
GO

