using System;

namespace War.Sql
{
    public class WarRepository : IWarRepository
    {
        private readonly string _connectionString;

        public WarRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public War Get(int id)
        {
            throw new NotImplementedException();
        }
    }
}
