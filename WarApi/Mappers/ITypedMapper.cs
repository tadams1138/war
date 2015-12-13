namespace WarApi.Mappers
{
    interface ITypedMapper<S, T>
    {
        T Map(S source);
    }
}
