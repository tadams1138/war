using System;
using System.Collections.Generic;

namespace War
{
    public interface IMatchRepository
    {
        void Update(VoteRequest voteRequest);
        IEnumerable<Match> GetAll(int warId);
        Match Get(Guid matchId);
    }
}
