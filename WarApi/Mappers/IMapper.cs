namespace WarApi.Mappers
{
    public interface IMapper
    {
        T Map<T>(object source);
    }
}
