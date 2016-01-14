using Autofac;
using Autofac.Integration.WebApi;
using System.Reflection;
using System.Web.Http;
using War;
using War.MatchFactories;
using War.RankingServices;
using War.Sql;
using WarApi.Mappers;
using WarApi.Properties;

namespace WarApi
{
    public static class WebApiConfig
    {
        public static void Register(HttpConfiguration config)
        {
            config.EnableCors();
            ConfigureDependencyInjection(config);
            ConfigureRouting(config);
        }

        private static void ConfigureRouting(HttpConfiguration config)
        {
            config.MapHttpAttributeRoutes();
            config.Routes.MapHttpRoute(
                name: "DefaultApi",
                routeTemplate: "api/{controller}/{id}",
                defaults: new { id = RouteParameter.Optional }
            );
        }

        private static void ConfigureDependencyInjection(HttpConfiguration config)
        {
            var builder = new ContainerBuilder();
            builder.RegisterApiControllers(Assembly.GetExecutingAssembly());
            builder.RegisterWebApiFilterProvider(config);

            builder.RegisterType<Mapper>().As<IMapper>();

            builder.RegisterType<SumDistinctWinsRankingStrategy>().As<IRankingService>();
            builder.RegisterType<RandomMatchStrategy>().As<IMatchFactory>();
            builder.Register(c => new ContestantRepository(Settings.Default.WarDb)).As<IContestantRepository>();
            builder.Register(c => new MatchRepository(Settings.Default.WarDb)).As<IMatchRepository>();
            builder.Register(c => new WarRepository(Settings.Default.WarDb)).As<IWarRepository>();
            builder.Register(c => new UserRepository(Settings.Default.WarDb)).As<IUserRepository>();

            var container = builder.Build();
            config.DependencyResolver = new AutofacWebApiDependencyResolver(container);
        }        
    }
}
