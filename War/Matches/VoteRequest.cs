using System;

namespace War.Matches
{
    public class VoteRequest
    {
        public VoteChoice Choice { get; set; }
        public Guid MatchId { get; set; }
    }
}