namespace WarApi.Mappers
{
    class MatchMapper : ITypedMapper<War.MatchFactories.MatchWithContestants, Models.Match>
    {
        private readonly ITypedMapper<War.Contestant, Models.Contestant> _contestantMapper;

        public MatchMapper(ITypedMapper<War.Contestant, Models.Contestant> contestantMapper)
        {
            _contestantMapper = contestantMapper;
        }

        public Models.Match Map(War.MatchFactories.MatchWithContestants source)
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
