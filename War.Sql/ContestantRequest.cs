using System;
using System.Collections.Generic;

namespace War.Sql
{
    internal class ContestantRequest
    {
        public string ContestantName {get; set;}
        public Dictionary<string, string> Definition { get; internal set; }
        public string ImageUrl { get; set; }

        public string LinkUrl { get; set; }
    }
}
