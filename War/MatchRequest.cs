using System;

namespace War
{
    public class MatchRequest
    {
        public Guid Contestant1 { get; internal set; }
        public Guid Contestant2 { get; internal set; }
    }
}
