using System;
using System.Collections.Generic;

namespace War.Sql
{
    public class ContestantRepository : IContestantRepository
    {
        private readonly string _connectionString;

        public ContestantRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public IEnumerable<Contestant> GetAll(int warId)
        {
            throw new NotImplementedException();
        }
    }
}
