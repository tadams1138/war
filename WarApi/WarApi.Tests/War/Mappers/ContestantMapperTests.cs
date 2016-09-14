using FluentAssertions;
using System;
using War.Contestants;

namespace WarApi.Mappers
{
    class ContestantMapperTests
    {
        public static Contestant CreateTestContestant()
        {
            var definition = new System.Collections.Generic.Dictionary<string, string> { { "Test Value1", Guid.NewGuid().ToString() }, { "Test Value2", Guid.NewGuid().ToString() } };
            return new Contestant
            {
                Id = Guid.NewGuid(),
                Definition = definition
            };
        }

        public static void VerifyContestantMapped(Contestant source, Models.Contestant target)
        {
            target.Id.Should().Be(source.Id);
            target.Definition.Should().Equal(source.Definition);
        }
    }
}
