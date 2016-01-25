using System.Data;
using System.Data.SqlClient;
using System.Threading.Tasks;

namespace War.Users.Sql
{
    public class UserRepository : IUserRepository
    {
        private string _connectionString;

        public UserRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public async Task Upsert(User user)
        {
            using (var connection = await CreateOpenConnection())
            using (var command = CreateUpsertCommand(user, connection))
            {
                await command.ExecuteNonQueryAsync();
            }
        }
        
        internal async Task<User> Get(UserIdentifier userIdentifier)
        {
            using (var connection = await CreateOpenConnection())
            using (var command = CreateSelectCommand(userIdentifier, connection))
            using (var reader = await command.ExecuteReaderAsync())
            {
                if (await reader.ReadAsync())
                {
                    var contestant = CreateUser(userIdentifier, reader);
                    return contestant;
                }

                return null;
            }
        }

        internal async Task Delete(UserIdentifier userIdentifier)
        {
            using (var connection = await CreateOpenConnection())
            using (var command = CreateDeleteCommand(userIdentifier, connection))
            {
                await command.ExecuteNonQueryAsync();
            }
        }

        private SqlCommand CreateUpsertCommand(User user, SqlConnection connection)
        {
            var command = connection.CreateCommand();
            command.CommandText =
@"IF EXISTS (   
                SELECT [NameIdentifier] 
                FROM [dbo].[Users] 
                WHERE 
                    [NameIdentifier] = @nameIdentifier 
                    AND [AuthenticationType] = @authenticationType
            ) 

    BEGIN
       UPDATE [dbo].[Users] SET [Name] = @name 
       WHERE 
            [NameIdentifier] = @nameIdentifier
            AND [AuthenticationType] = @authenticationType
    END

ELSE

    BEGIN
       INSERT INTO [dbo].[Users] (NameIdentifier, AuthenticationType, Name) VALUES
       (@nameIdentifier, @authenticationType, @name) 
    END";
            command.Parameters.AddWithValue("@name", user.Name);
            command.Parameters.AddWithValue("@authenticationType", user.Id.AuthenticationType);
            command.Parameters.AddWithValue("@nameIdentifier", user.Id.NameIdentifier);
            return command;
        }

        private SqlCommand CreateDeleteCommand(UserIdentifier userIdentifier, SqlConnection connection)
        {
            var command = connection.CreateCommand();
            command.CommandText = "DELETE FROM [dbo].[Users] WHERE [AuthenticationType] = @authenticationType AND [NameIdentifier] = @nameIdentifier;";
            command.CommandType = CommandType.Text;
            command.Parameters.AddWithValue("@authenticationType", userIdentifier.AuthenticationType);
            command.Parameters.AddWithValue("@nameIdentifier", userIdentifier.NameIdentifier);
            return command;
        }

        private User CreateUser(UserIdentifier userIdentifier, IDataReader reader)
        {
            var name = reader.GetString(0);
            var user = new User
            {
                Id = userIdentifier,
                Name = name
            };
            return user;
        }

        private SqlCommand CreateSelectCommand(UserIdentifier userIdentifier, SqlConnection connection)
        {
            var command = connection.CreateCommand();
            command.CommandText = "SELECT [Name] FROM [dbo].[Users] WHERE [AuthenticationType] = @authenticationType AND [NameIdentifier] = @nameIdentifier;";
            command.CommandType = CommandType.Text;
            command.Parameters.AddWithValue("@authenticationType", userIdentifier.AuthenticationType);
            command.Parameters.AddWithValue("@nameIdentifier", userIdentifier.NameIdentifier);
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
