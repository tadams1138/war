using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace War
{
    public interface IMatchRepository
    {
        Task Update(int warId, VoteRequest voteRequest);
        Task<IEnumerable<Match>> GetAll(int warId);
        Task<Match> Get(int warId, Guid matchId);
        Task<Guid> Create(int warId, MatchRequest matchRequest);
    }
}
