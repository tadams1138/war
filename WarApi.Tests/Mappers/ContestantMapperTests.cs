using FluentAssertions;
using System;

namespace WarApi.Mappers
{
    class ContestantMapperTests
    {
        public static War.Contestant CreateTestContestant()
        {
            var definition = new System.Collections.Generic.Dictionary<string, string> { { "Test Value1", Guid.NewGuid().ToString() }, { "Test Value2", Guid.NewGuid().ToString() } };
            return new War.Contestant
            {
                Id = Guid.NewGuid(),
                Definition = definition
            };
        }

        public static void VerifyContestantMapped(War.Contestant source, Models.Contestant target)
        {
            target.Id.Should().Be(source.Id);
            target.Definition.Should().Equal(source.Definition);
        }
    }
}
