CREATE TABLE [dbo].[Contestants] (
    [Id]         UNIQUEIDENTIFIER NOT NULL,
    [WarId]      INT              NOT NULL,
    [Definition] XML              NOT NULL,
    PRIMARY KEY CLUSTERED ([Id] ASC)
);

