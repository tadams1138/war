CREATE TABLE [dbo].[Users] (
    [NameIdentifier]     NVARCHAR (50) NOT NULL,
    [AuthenticationType] NVARCHAR (50) NOT NULL,
    [Name]               NVARCHAR (50) NOT NULL,
    PRIMARY KEY CLUSTERED ([AuthenticationType] ASC, [NameIdentifier] ASC)
);

