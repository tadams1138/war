using System.Collections.Generic;

namespace War
{
    public interface IContestantRepository
    {
        IEnumerable<Contestant> GetAll(int warId);
    }
}
