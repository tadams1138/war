using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Data.SqlTypes;
using System.Linq;
using System.Threading.Tasks;
using System.Xml.Linq;

namespace War.Contestants.Sql
{
    public class ContestantRepository : IContestantRepository
    {
        private readonly string _connectionString;

        public ContestantRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public async Task<Contestant> Get(int warId, int index)
        {
            if (index < 0)
            {
                throw new ArgumentOutOfRangeException(nameof(index), "Value cannot be negative.");
            }

            using (var connection = await CreateOpenConnection())
            using (var command = CreateSelectCommand(warId, connection, index))
            using (var reader = await command.ExecuteReaderAsync())
            {
                if (await reader.ReadAsync())
                {
                    var contestant = CreateContestant(reader);
                    return contestant;
                }
                else
                {
                    throw new ArgumentOutOfRangeException(nameof(index), "Value cannot be greater than or equal to the number of contestants in the repository.");
                }
            }
        }

        public async Task<IEnumerable<Contestant>> GetAll(int warId)
        {
            var contestants = new List<Contestant>();
            using (var connection = await CreateOpenConnection())
            using (var command = CreateSelectAllCommand(warId, connection))
            using (var reader = await command.ExecuteReaderAsync())
            {
                while (await reader.ReadAsync())
                {
                    var contestant = CreateContestant(reader);
                    contestants.Add(contestant);
                }
            }

            return contestants;
        }

        public async Task Update(int warId, Contestant c)
        {
            using (var connection = await CreateOpenConnection())
            using (var command = CreateUpdateCommand(connection, c))
            {
                await command.ExecuteScalarAsync();
            }
        }

        public async Task Create(int warId, ContestantRequest c)
        {
            using (var connection = await CreateOpenConnection())
            using (var command = CreateInsertCommand(warId, connection, c))
            {
                await command.ExecuteScalarAsync();
            }
        }

        public async Task<int> GetCount(int warId)
        {
            using (var connection = await CreateOpenConnection())
            using (var command = CreateGetCountCommand(warId, connection))
            {
                var result = (int)(await command.ExecuteScalarAsync());
                return result;
            }
        }

        internal async Task Delete(int warId, Contestant c)
        {
            using (var connection = await CreateOpenConnection())
            using (var command = CreateDeleteCommand(warId, c, connection))
            {
                await command.ExecuteScalarAsync();
            }
        }

        internal async Task DeleteAll(int warId)
        {
            using (var connection = await CreateOpenConnection())
            using (var command = CreateDeleteAllCommand(warId, connection))
            {
                await command.ExecuteScalarAsync();
            }
        }

        private Contestant CreateContestant(SqlDataReader reader)
        {
            var id = reader.GetGuid(0);
            var sqlXml = reader.GetSqlXml(1);
            var dictionary = CreateDictionary(sqlXml);
            var contestant = new Contestant
            {
                Id = id,
                Definition = dictionary
            };
            return contestant;
        }

        private static SqlCommand CreateSelectCommand(int warId, SqlConnection connection, int index)
        {
            var command = connection.CreateCommand();
            command.CommandText = "SELECT [Id], [Definition] FROM [dbo].[Contestants] WITH (NOLOCK) WHERE [WarId] = @WarId ORDER BY [Id] OFFSET @Index ROWS FETCH NEXT 1 ROWS ONLY;";
            command.CommandType = CommandType.Text;
            command.Parameters.AddWithValue("@WarId", warId);
            command.Parameters.AddWithValue("@Index", index);
            return command;
        }

        private static SqlCommand CreateSelectAllCommand(int warId, SqlConnection connection)
        {
            var command = connection.CreateCommand();
            command.CommandText = "SELECT [Id], [Definition] FROM [dbo].[Contestants] WITH (NOLOCK) WHERE [WarId] = @WarId;";
            command.CommandType = CommandType.Text;
            command.Parameters.AddWithValue("@WarId", warId);
            return command;
        }

        private static SqlCommand CreateUpdateCommand(SqlConnection connection, Contestant contestant)
        {
            var command = connection.CreateCommand();
            command.CommandText = "UPDATE [dbo].[Contestants] SET [Definition] = @Definition WHERE [Id] = @Id;";
            command.CommandType = CommandType.Text;
            command.Parameters.AddWithValue("@Id", contestant.Id);
            AddDefinitionParameter(command, contestant.Definition);
            return command;
        }

        private static SqlCommand CreateInsertCommand(int warId, SqlConnection connection, ContestantRequest request)
        {
            var command = connection.CreateCommand();
            command.CommandText = "INSERT INTO [dbo].[Contestants] ([Id], [WarId], [Definition]) VALUES (NEWID(), @WarId, @Definition);";
            command.CommandType = CommandType.Text;
            command.Parameters.AddWithValue("@WarId", warId);
            AddDefinitionParameter(command, request.Definition);
            return command;
        }

        private static SqlCommand CreateDeleteAllCommand(int warId, SqlConnection connection)
        {
            var command = connection.CreateCommand();
            command.CommandText = "DELETE FROM [dbo].[Contestants] WHERE [WarId] = @WarId;";
            command.CommandType = CommandType.Text;
            command.Parameters.AddWithValue("@WarId", warId);
            return command;
        }

        private static SqlCommand CreateDeleteCommand(int warId, Contestant contestant, SqlConnection connection)
        {
            var command = connection.CreateCommand();
            command.CommandText = "DELETE FROM [dbo].[Contestants] WHERE [WarId] = @WarId AND [Id] = @Id;";
            command.CommandType = CommandType.Text;
            command.Parameters.AddWithValue("@WarId", warId);
            command.Parameters.AddWithValue("@Id", contestant.Id);
            return command;
        }

        private static SqlCommand CreateGetCountCommand(int warId, SqlConnection connection)
        {
            var command = connection.CreateCommand();
            command.CommandText = "SELECT COUNT(*) FROM [dbo].[Contestants] WITH (NOLOCK) WHERE [WarId] = @WarId;";
            command.CommandType = CommandType.Text;
            command.Parameters.AddWithValue("@WarId", warId);
            return command;
        }

        private static void AddDefinitionParameter(SqlCommand command, Dictionary<string, string> definition)
        {
            var definitionParameter = command.Parameters.Add("@Definition", SqlDbType.Xml);
            var sqlXml = CreateSqlXml(definition);
            definitionParameter.Value = sqlXml;
        }

        private static SqlXml CreateSqlXml(Dictionary<string, string> definition)
        {
            XElement root = ConvertDictionaryToXElement(definition);
            var reader = root.CreateReader();
            var sqlXml = new SqlXml(reader);
            return sqlXml;
        }

        private Dictionary<string, string> CreateDictionary(SqlXml sqlXml)
        {
            var xml = XElement.Parse(sqlXml.Value);
            var dictionary = ConvertXElementToDictionary(xml);
            return dictionary;
        }

        private static XElement ConvertDictionaryToXElement(Dictionary<string, string> definition)
        {
            var result = new XElement("Root",
                from keyValue in definition
                select new XElement(keyValue.Key, keyValue.Value)
                );
            return result;
        }

        private Dictionary<string, string> ConvertXElementToDictionary(XElement xml)
        {
            var result = xml.Nodes().ToDictionary(n => ((XElement)n).Name.LocalName, n => ((XElement)n).Value);
            return result;
        }

        private async Task<SqlConnection> CreateOpenConnection()
        {
            var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            return connection;
        }
    }
}
