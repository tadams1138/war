using System;
using War.Users;

namespace War.Matches
{
    public class MatchRequest
    {
        public Guid Contestant1 { get; set; }
        public Guid Contestant2 { get; set; }
        public UserIdentifier UserIdentifier { get; set; }
    }
}
