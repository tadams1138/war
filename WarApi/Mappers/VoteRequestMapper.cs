using War;

namespace WarApi.Mappers
{
    class VoteRequestMapper : ITypedMapper<Models.VoteRequest, VoteRequest>
    {
        public VoteRequest Map(Models.VoteRequest source)
        {
            var target = new VoteRequest
            {
                MatchId = source.MatchId,
                Choice = (VoteChoice)((int)source.Choice)
            };
            return target;
        }
    }
}
