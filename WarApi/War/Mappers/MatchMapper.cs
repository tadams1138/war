using War.Contestants;
using War.Matches.Factories;

namespace WarApi.Mappers
{
    class MatchMapper : ITypedMapper<MatchWithContestants, Models.Match>
    {
        private readonly ITypedMapper<Contestant, Models.Contestant> _contestantMapper;

        public MatchMapper(ITypedMapper<Contestant, Models.Contestant> contestantMapper)
        {
            _contestantMapper = contestantMapper;
        }

        public Models.Match Map(MatchWithContestants source)
        {
            var contestant1 = _contestantMapper.Map(source.Contestant1);
            var contestant2 = _contestantMapper.Map(source.Contestant2);
            var target = new Models.Match
            {
                Id = source.Id,
                Contestant1 = contestant1,
                Contestant2 = contestant2
            };
            return target;
        }
    }
}
