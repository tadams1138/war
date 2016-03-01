using System;
using War.Users;

namespace War.Votes
{
    public class Vote
    {
        public DateTime CreatedDate { get; set; }
        public Guid MatchId { get; set; }
        public VoteChoice Choice { get; set; }
        public UserIdentifier UserId { get; set; }
    }
}
