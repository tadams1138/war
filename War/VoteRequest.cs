using System;

namespace War
{
    public class VoteRequest
    {
        public VoteChoice Choice { get; set; }
        public Guid MatchId { get; set; }
    }
}