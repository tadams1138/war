using FluentAssertions;
using System;

namespace WarApi.Mappers
{
    class ContestantMapperTests
    {
        public static War.Contestant CreateTestContestant()
        {
            return new War.Contestant
            {
                Id = Guid.NewGuid()
            };
        }

        public static void VerifyContestantMapped(War.Contestant source, Models.Contestant target)
        {
            target.Id.Should().Be(source.Id);
        }
    }
}
