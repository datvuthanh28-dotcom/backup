IF OBJECT_ID('dbo.EmailNotifications', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.EmailNotifications (
        id INT IDENTITY(1,1) PRIMARY KEY,
        event_key NVARCHAR(180) NOT NULL,
        event_type NVARCHAR(64) NOT NULL,
        entity_type NVARCHAR(64) NOT NULL,
        entity_id NVARCHAR(128) NOT NULL,
        recipient_email NVARCHAR(500) NOT NULL,
        subject NVARCHAR(255) NOT NULL,
        provider NVARCHAR(32) NOT NULL CONSTRAINT DF_EmailNotifications_Provider DEFAULT 'resend',
        status NVARCHAR(20) NOT NULL CONSTRAINT DF_EmailNotifications_Status DEFAULT 'pending'
            CONSTRAINT CK_EmailNotifications_Status CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
        provider_message_id NVARCHAR(128) NULL,
        error_message NVARCHAR(1000) NULL,
        meta_json NVARCHAR(2000) NULL,
        attempts INT NOT NULL CONSTRAINT DF_EmailNotifications_Attempts DEFAULT 1,
        last_attempt_at DATETIME2 NOT NULL CONSTRAINT DF_EmailNotifications_LastAttempt DEFAULT SYSUTCDATETIME(),
        sent_at DATETIME2 NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_EmailNotifications_CreatedAt DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_EmailNotifications_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_EmailNotifications_EventKey UNIQUE (event_key)
    );

    CREATE INDEX IX_EmailNotifications_Status_LastAttempt
        ON dbo.EmailNotifications (status, last_attempt_at DESC);

    CREATE INDEX IX_EmailNotifications_Entity
        ON dbo.EmailNotifications (entity_type, entity_id, created_at DESC);
END
GO

