using System;

namespace War
{
    public class Match
    {
        public Guid Id { get; set; }
        public Guid Contestant1 { get; set; }
        public Guid Contestant2 { get; set; }
        public VoteChoice Result { get; set; }
    }
}
