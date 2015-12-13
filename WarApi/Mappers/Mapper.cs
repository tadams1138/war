namespace WarApi.Mappers
{
    class Mapper : IMapper
    {
        private readonly MapperFactory _mapperFactory;

        public Mapper()
        {
            _mapperFactory = new MapperFactory();
        }

        public T Map<S, T>(S source)
        {
            var mapper = _mapperFactory.Get<S, T>();
            var result = mapper.Map(source);
            return result;
        }
    }
}
