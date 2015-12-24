using System;
using System.Collections.Generic;

namespace WarApi.Models
{
    public class Contestant
    {
        public Dictionary<string, string> Definition { get; internal set; }
        public Guid Id { get; internal set; }
    }
}
