using System;

namespace War
{
    public class MatchRequest
    {
        public Guid Contestant1 { get; set; }
        public Guid Contestant2 { get; set; }
        public UserIdentifier UserIdentifier { get; set; }
    }
}
