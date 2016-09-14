using System;
using War.Users;

namespace War.Votes
{
    public class VoteRequest
    {
        public VoteChoice Choice { get; set; }
        public Guid MatchId { get; set; }
        public UserIdentifier UserIdentifier { get; set; }
    }
}