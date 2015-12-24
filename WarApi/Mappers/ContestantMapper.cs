namespace WarApi.Mappers
{
    class ContestantMapper : ITypedMapper<War.Contestant, Models.Contestant>
    {
        public Models.Contestant Map(War.Contestant source)
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
