namespace WarApi.Mappers
{
    public interface IMapper
    {
        T Map<S, T>(S source);
    }
}
