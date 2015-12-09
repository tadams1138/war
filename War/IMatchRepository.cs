using System.Collections.Generic;

namespace War
{
    public interface IMatchRepository
    {
        Match Create(int warId);
        void Update(VoteRequest voteRequest);
        IEnumerable<Match> GetAll(int warId);
    }
}
