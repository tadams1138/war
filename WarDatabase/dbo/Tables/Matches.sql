CREATE TABLE [dbo].[Matches] (
    [Id]                 UNIQUEIDENTIFIER NOT NULL,
    [WarId]              INT              NOT NULL,
    [Contestant1]        UNIQUEIDENTIFIER NOT NULL,
    [Contestant2]        UNIQUEIDENTIFIER NOT NULL,
    [Result]             SMALLINT         NOT NULL,
    [CreatedDate]        DATETIME2 (7)    NOT NULL,
    [VoteDate]           DATETIME2 (7)    NULL,
    [AuthenticationType] NVARCHAR (50)    NOT NULL,
    [NameIdentifier]     NVARCHAR (50)    NOT NULL,
    PRIMARY KEY CLUSTERED ([Id] ASC)
);

