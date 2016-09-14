using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Threading.Tasks;
using War.Users;

namespace War.Votes.Sql
{
    public class VoteRepository : IVoteRepository
    {
        const string GetFieldList = "[MatchId], [Choice], [Created], [AuthenticationType], [NameIdentifier]";
        private readonly string _connectionString;

        public VoteRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public async Task Add(int warId, VoteRequest request)
        {
            using (var connection = await CreateOpenConnection())
            using (var command = CreateInsertCommand(warId, request, connection))
            {
                await command.ExecuteNonQueryAsync();
            }
        }

        public async Task<IEnumerable<Vote>> Get(int warId, Guid matchId)
        {
            using (var connection = await CreateOpenConnection())
            using (var command = CreateGetCommand(warId, matchId, connection))
            using (var reader = await command.ExecuteReaderAsync())
            {
                var results = await GetAll(reader);
                return results;
            }
        }

        public async Task<IEnumerable<Vote>> GetAll(int warId)
        {
            using (var connection = await CreateOpenConnection())
            using (var command = CreateGetAllCommand(warId, connection))
            using (var reader = await command.ExecuteReaderAsync())
            {
                var results = await GetAll(reader);
                return results;
            }
        }

        public async Task Delete(int warId, Guid matchId)
        {
            using (var connection = await CreateOpenConnection())
            using (var command = CreateDeleteCommand(warId, matchId, connection))
                await command.ExecuteNonQueryAsync();
        }

        private Vote CreateVote(SqlDataReader reader)
        {
            var id = reader.GetGuid(0);
            var choice = (VoteChoice)reader.GetInt16(1);
            var createdDate = reader.GetDateTime(2);
            var authenticationType = reader.GetString(3);
            var nameIdentidier = reader.GetString(4);
            var userId = new UserIdentifier
            {
                AuthenticationType = authenticationType,
                NameIdentifier = nameIdentidier
            };
            var result = new Vote
            {
                MatchId = id,
                Choice = choice,
                CreatedDate = createdDate,
                UserId = userId
            };
            return result;
        }

        private SqlCommand CreateGetAllCommand(int warId, SqlConnection connection)
        {
            var command = connection.CreateCommand();
            command.CommandText = $"SELECT {GetFieldList} FROM [dbo].[Votes] WITH (NOLOCK) WHERE [WarId] = @WarId;";
            command.Parameters.AddWithValue("@WarId", warId);
            return command;
        }

        private async Task<IEnumerable<Vote>> GetAll(SqlDataReader reader)
        {
            var results = new List<Vote>();
            while (await reader.ReadAsync())
            {
                var match = CreateVote(reader);
                results.Add(match);
            }
            return results;
        }

        private static SqlCommand CreateGetCommand(int warId, Guid matchId, SqlConnection connection)
        {
            var command = connection.CreateCommand();
            command.CommandText = $"SELECT {GetFieldList} FROM [dbo].[Votes] WITH (NOLOCK) WHERE [WarId] = @WarId AND [MatchId] = @MatchId;";
            command.Parameters.AddWithValue("@WarId", warId);
            command.Parameters.AddWithValue("@MatchId", matchId);
            return command;
        }

        private static SqlCommand CreateDeleteCommand(int warId, Guid id, SqlConnection connection)
        {
            var command = connection.CreateCommand();
            command.CommandText = "DELETE FROM [dbo].[Votes] WHERE [MatchId] = @MatchId AND [WarId] = @WarId;";
            command.CommandType = CommandType.Text;
            command.Parameters.AddWithValue("@MatchId", id);
            command.Parameters.AddWithValue("@WarId", warId);
            return command;
        }

        private static SqlCommand CreateInsertCommand(int warId, VoteRequest request, SqlConnection connection)
        {
            var command = connection.CreateCommand();
            command.CommandText = "INSERT INTO [dbo].[Votes] (WarId, Choice, MatchId, Created, AuthenticationType, NameIdentifier) VALUES (@WarId, @Choice, @MatchId, @CreatedDateTime, @AuthenticationType, @NameIdentifier);";
            command.CommandType = CommandType.Text;
            command.Parameters.AddWithValue("@WarId", warId);
            command.Parameters.AddWithValue("@Choice", request.Choice);
            command.Parameters.AddWithValue("@MatchId", request.MatchId);
            command.Parameters.AddWithValue("@AuthenticationType", request.UserIdentifier.AuthenticationType);
            command.Parameters.AddWithValue("@NameIdentifier", request.UserIdentifier.NameIdentifier);
            command.Parameters.AddWithValue("@CreatedDateTime", DateTime.UtcNow);
            return command;
        }

        private async Task<SqlConnection> CreateOpenConnection()
        {
            var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            return connection;
        }
    }
}
