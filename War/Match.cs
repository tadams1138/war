using System;

namespace War
{
    public class Match
    {
        public Guid Contestant1 { get; set; }
        public Guid Contestant2 { get; set; }
        public MatchResult Result { get; set; }
    }
}
