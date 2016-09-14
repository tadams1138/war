using War.Contestants;

namespace WarApi.Mappers
{
    class ContestantMapper : ITypedMapper<Contestant, Models.Contestant>
    {
        public Models.Contestant Map(Contestant source)
        {
            var target = new Models.Contestant
            {
                Id = source.Id,
                Definition = source.Definition
            };
            return target;
        }
    }
}
