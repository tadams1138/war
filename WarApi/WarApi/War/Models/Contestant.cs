using System;
using System.Collections.Generic;

namespace WarApi.Models
{
    /// <summary>
    /// A contestant in the war.
    /// </summary>
    public class Contestant
    {
        /// <summary>
        /// Contains descriptions of the contestant. This is particular to the war
        /// and may vary from war to war.
        /// </summary>
        public Dictionary<string, string> Definition { get; internal set; }

        /// <summary>
        /// The contestant's ID.
        /// </summary>
        public Guid Id { get; internal set; }
    }
}
