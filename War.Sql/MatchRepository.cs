using System;
using System.Collections.Generic;

namespace War.Sql
{
    public class MatchRepository : IMatchRepository
    {
        private readonly string _connectionString;

        public MatchRepository(string connectionString)
        {
            _connectionString = connectionString;
        }

        public Guid Create(MatchRequest matchRequest)
        {
            throw new NotImplementedException();
        }

        public Match Get(Guid matchId)
        {
            throw new NotImplementedException();
        }

        public IEnumerable<Match> GetAll(int warId)
        {
            throw new NotImplementedException();
        }

        public void Update(VoteRequest voteRequest)
        {
            throw new NotImplementedException();
        }
    }
}
