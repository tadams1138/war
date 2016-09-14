using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace War.Votes
{
    public interface IVoteRepository
    {
        Task Add(int warId, VoteRequest request);
        Task<IEnumerable<Vote>> Get(int warId, Guid matchId);
        Task<IEnumerable<Vote>> GetAll(int warId);
    }
}
