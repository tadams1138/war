using System.Data;
using System.Data.SqlClient;
using System.Threading.Tasks;

namespace War.Sql
{
    public class WarRepository : IWarRepository
    {
        private readonly string _connectionString;

        public WarRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public async Task<War> Get(int id)
        {
            using (var connection = await CreateOpenConnection())
            using (var command = CreateGetCommand(id, connection))
            using (var reader = await command.ExecuteReaderAsync())
            {
                if (!reader.Read()) return null;

                var war = CreateWar(reader);
                return war;
            }
        }
        
        internal async Task<int> Create(WarRequest request)
        {
            using (var connection = await CreateOpenConnection())
            using (var command = CreateInsertCommand(request, connection))
            {
                var id = (int)await command.ExecuteScalarAsync();
                return id;
            }
        }

        public async Task Delete(int id)
        {
            using (var connection = await CreateOpenConnection())
            using (var command = CreateDeleteCommand(id, connection))
            {
                await command.ExecuteNonQueryAsync();
            }
        }

        private War CreateWar(SqlDataReader reader)
        {
            var title = reader.GetString(1);
            var result = new War
            {
                Title = title
            };
            return result;
        }

        private SqlCommand CreateGetCommand(int id, SqlConnection connection)
        {
            var command = connection.CreateCommand();
            command.CommandText = "SELECT [Id], [Title] FROM [dbo].[Wars] WHERE [Id] = @Id;";
            command.CommandType = CommandType.Text;
            command.Parameters.AddWithValue("@Id", id);
            return command;
        }

        private SqlCommand CreateDeleteCommand(int id, SqlConnection connection)
        {
            var command = connection.CreateCommand();
            command.CommandText = "DELETE FROM [dbo].[Wars] WHERE [Id] = @Id;";
            command.CommandType = CommandType.Text;
            command.Parameters.AddWithValue("@Id", id);
            return command;
        }

        private static SqlCommand CreateInsertCommand(WarRequest request, SqlConnection connection)
        {
            var command = connection.CreateCommand();
            command.CommandText = "INSERT INTO [dbo].[Wars] (Title) OUTPUT inserted.[Id] VALUES (@Title)";
            command.CommandType = CommandType.Text;
            command.Parameters.AddWithValue("@Title", request.Title);
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
