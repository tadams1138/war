using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace War.Matches
{
    public interface IMatchRepository
    {
        Task<IEnumerable<Match>> GetAll(int warId);
        Task<Match> Get(int warId, Guid matchId);
        Task<Guid> Create(int warId, MatchRequest matchRequest);
    }
}
