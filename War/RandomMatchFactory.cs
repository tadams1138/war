using System;

namespace War
{
    public class RandomMatchFactory : IMatchFactory
    {
        private readonly IContestantRepository _contestantRepository;
        private readonly IMatchRepository _matchRepository;

        public RandomMatchFactory(IMatchRepository matchRepository, IContestantRepository contestantRepository)
        {
            _matchRepository = matchRepository;
            _contestantRepository = contestantRepository;
        }

        public MatchWithContestants Create(int warId)
        {
            throw new NotImplementedException();
        }
    }
}
