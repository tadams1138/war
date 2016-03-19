using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using System.Xml;

namespace MovieWar.ContestantCreator
{
    class WikipediaTopGrossingMoviesMovieIdFactory
    {
        internal async Task<IEnumerable<MovieIdentifier>> GetMovieIds(int minYear, int maxYear)
        {
            List<MovieIdentifier> movieIds = new List<MovieIdentifier>();
            for (var year = minYear; year <= maxYear; year++)
            {
                List<MovieIdentifier> movieIdsByYear = await GetMovieIdsByYear(year);
                movieIds.AddRange(movieIdsByYear);
            }

            return movieIds;
        }

        private static async Task<List<MovieIdentifier>> GetMovieIdsByYear(int year)
        {
            try
            {
                XmlDocument doc = await GetYearInFilmFromWikipedia(year);
                XmlNode topGrossingTable = GetTopGrossingTable(doc);
                List<MovieIdentifier> movieIds = ExtractMovieIds(year, topGrossingTable);
                return movieIds;
            }
            catch (Exception ex)
            {
                throw new Exception($"Failed to get for year {year}", ex);
            }
        }

        private static List<MovieIdentifier> ExtractMovieIds(int year, XmlNode topGrossingTable)
        {
            var movieIds = new List<MovieIdentifier>();
            foreach (XmlNode n in topGrossingTable.ChildNodes)
            {
                var titleLink = n.SelectSingleNode(".//a");
                if (titleLink != null && titleLink.ParentNode.Name != "sup") // not a superscript link
                {
                    MovieIdentifier movieId = CreateMovieId(year, titleLink);
                    movieIds.Add(movieId);
                }
            }

            return movieIds;
        }

        private static MovieIdentifier CreateMovieId(int year, XmlNode titleLink)
        {
            var title = titleLink.InnerText;
            var movieId = new MovieIdentifier
            {
                Year = year,
                Title = title
            };
            return movieId;
        }

        private static async Task<XmlDocument> GetYearInFilmFromWikipedia(int year)
        {
            var url = $"https://en.wikipedia.org/wiki/{year}_in_film";
            using (var client = new HttpClient())
            {
                var response = await client.GetAsync(url);
                response.EnsureSuccessStatusCode();
                var ms = new MemoryStream(response.Content.ReadAsByteArrayAsync().Result);
                var doc = new XmlDocument();
                doc.Load(ms);
                return doc;
            }
        }

        private static XmlNode GetTopGrossingTable(XmlDocument doc)
        {
            XmlNode sectionTitleSpanNode = GetTopGrossingSectionTitleSpanNode(doc);

            var sectionTitleNode = sectionTitleSpanNode.ParentNode;
            var sectionTable = sectionTitleNode.NextSibling;
            while (sectionTable != null)
            {
                if (IsTopGrossingTable(sectionTable))
                {
                    break;
                }
                else if (sectionTable.Name == "h2") // went too far
                {
                    sectionTable = null;
                    break;
                }

                sectionTable = sectionTable.NextSibling;
            }

            if (sectionTable == null)
            {
                throw new Exception("Could not find top grossing table");
            }

            return sectionTable;
        }

        private static XmlNode GetTopGrossingSectionTitleSpanNode(XmlDocument doc)
        {
            var patterns = new[] { "top_grossing", "highest-grossing", "highest_grossing" };
            XmlNode sectionTitleSpanNode = null;
            foreach (var p in patterns)
            {
                sectionTitleSpanNode = doc.SelectSingleNode($"//span[starts-with(translate(@id, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'),'{p}')]");
                if (sectionTitleSpanNode != null)
                {
                    break;
                }
            }
            if (sectionTitleSpanNode == null)
            {
                throw new Exception("Could not find top grossing section title span node.");
            }

            return sectionTitleSpanNode;
        }

        private static bool IsTopGrossingTable(XmlNode sectionTable)
        {
            return sectionTable.Name == "table" && sectionTable.Attributes[0].Name == "class" && sectionTable.Attributes[0].Value.StartsWith("wikitable");
        }
    }
}
