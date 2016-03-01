using War.Votes;

namespace WarApi.Mappers
{
    class VoteRequestMapper : ITypedMapper<Models.VoteRequest, VoteRequest>
    {
        public VoteRequest Map(Models.VoteRequest source)
        {
            var target = new VoteRequest
            {
                MatchId = source.MatchId,
                Choice = (VoteChoice)((int)source.Choice - 1)
            };
            return target;
        }
    }
}
