using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Threading.Tasks;
using System.Linq;
using War.Users;

namespace War.Matches.Sql
{
    public class MatchRepository : IMatchRepository
    {
        const string GetFieldList = "[Id], [Contestant1], [Contestant2], [CreatedDate], [AuthenticationType], [NameIdentifier]";
        private readonly string _connectionString;

        public MatchRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public async Task<Guid> Create(int warId, MatchRequest request)
        {
            using (var connection = await CreateOpenConnection())
            using (var command = CreateInsertCommand(warId, request, connection))
            {
                var id = (Guid)await command.ExecuteScalarAsync();
                return id;
            }
        }

        public async Task<Match> Get(int warId, Guid matchId)
        {
            using (var connection = await CreateOpenConnection())
            using (var command = CreateGetCommand(warId, matchId, connection))
            using (var reader = await command.ExecuteReaderAsync())
            {
                var results = await GetAll(reader);
                var result = results.SingleOrDefault();
                return result;
            }
        }

        public async Task<IEnumerable<Match>> GetAll(int warId)
        {
            using (var connection = await CreateOpenConnection())
            using (var command = CreateGetAllCommand(warId, connection))
            using (var reader = await command.ExecuteReaderAsync())
            {
                var results = await GetAll(reader);
                return results;
            }
        }

        public async Task Delete(int warId, Guid id)
        {
            using (var connection = await CreateOpenConnection())
            using (var command = CreateDeleteCommand(warId, id, connection))
                await command.ExecuteNonQueryAsync();
        }

        private Match CreateMatch(SqlDataReader reader)
        {
            var createdDate = reader.GetDateTime(3);
            var contestant2 = reader.GetGuid(2);
            var contestant1 = reader.GetGuid(1);
            var id = reader.GetGuid(0);
            var authenticationType = reader.GetString(4);
            var nameIdentidier = reader.GetString(5);
            var userId = new UserIdentifier
            {
                AuthenticationType = authenticationType,
                NameIdentifier = nameIdentidier
            };
            var result = new Match
            {
                Id = id,
                Contestant1 = contestant1,
                Contestant2 = contestant2,
                CreatedDate = createdDate,
                UserId = userId
            };
            return result;
        }
        
        private SqlCommand CreateGetAllCommand(int warId, SqlConnection connection)
        {
            var command = connection.CreateCommand();
            command.CommandText = $"SELECT {GetFieldList} FROM [dbo].[Matches] WITH (NOLOCK) WHERE [WarId] = @WarId;";
            command.Parameters.AddWithValue("@WarId", warId);
            return command;
        }

        private async Task<IEnumerable<Match>> GetAll(SqlDataReader reader)
        {
            var results = new List<Match>();
            while (await reader.ReadAsync())
            {
                var match = CreateMatch(reader);
                results.Add(match);
            }
            return results;
        }

        private static SqlCommand CreateGetCommand(int warId, Guid matchId, SqlConnection connection)
        {
            var command = connection.CreateCommand();
            command.CommandText = $"SELECT {GetFieldList} FROM [dbo].[Matches] WITH (NOLOCK) WHERE [WarId] = @WarId AND [Id] = @Id;";
            command.Parameters.AddWithValue("@WarId", warId);
            command.Parameters.AddWithValue("@Id", matchId);
            return command;
        }
        
        private static SqlCommand CreateDeleteCommand(int warId, Guid id, SqlConnection connection)
        {
            var command = connection.CreateCommand();
            command.CommandText = "DELETE FROM [dbo].[Matches] WHERE [Id] = @Id AND [WarId] = @WarId;";
            command.CommandType = CommandType.Text;
            command.Parameters.AddWithValue("@Id", id);
            command.Parameters.AddWithValue("@WarId", warId);
            return command;
        }

        private static SqlCommand CreateInsertCommand(int warId, MatchRequest request, SqlConnection connection)
        {
            var command = connection.CreateCommand();
            command.CommandText = "INSERT INTO [dbo].[Matches] (Contestant1, Contestant2, WarId, Id, CreatedDate, AuthenticationType, NameIdentifier) OUTPUT inserted.[Id] VALUES (@Contestant1, @Contestant2, @WarId, NEWID(), @CreatedDateTime, @AuthenticationType, @NameIdentifier);";
            command.CommandType = CommandType.Text;
            command.Parameters.AddWithValue("@Contestant1", request.Contestant1);
            command.Parameters.AddWithValue("@Contestant2", request.Contestant2);
            command.Parameters.AddWithValue("@WarId", warId);
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
