using System;
using War.Users;

namespace War.Matches
{
    public class Match
    {
        public Guid Id { get; set; }
        public Guid Contestant1 { get; set; }
        public Guid Contestant2 { get; set; }
        public VoteChoice Result { get; set; }
        public DateTime CreatedDate { get; set; }
        public DateTime? VoteDate { get; set; }

        public UserIdentifier UserId { get; set; }
    }
}
