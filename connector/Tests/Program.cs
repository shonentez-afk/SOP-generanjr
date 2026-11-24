using Sop.SharePoint;
using System.Net;
using System.Xml;
using System.Xml.Linq;

static void Check(bool condition, string name)
{
    if (!condition) throw new Exception("FAIL: " + name);
    Console.WriteLine("PASS: " + name);
}
static XElement Entry(params (string Key, string Value)[] props)
    => new(Atom.A+"entry", new XElement(Atom.A+"content",
        new XElement(Atom.M+"properties", props.Select(p => new XElement(Atom.D+p.Key,p.Value)))));
static string Feed(IEnumerable<XElement> entries)
    => new XElement(Atom.A+"feed", entries).ToString();
static XElement Field(FieldSpec f, int i, string? type = null)
    => Entry(("Title",f.Title),("InternalName","Field"+i),("EntityPropertyName","Field"+i),
        ("TypeAsString",type ?? f.Type),("Required",f.Required ? "true" : "false"),("ReadOnlyField","false"));

Check(Schema.Expected.Count == 7 && Schema.Expected.Sum(x=>x.Fields.Length)==70, "7 storages and 70 business fields");
Check(!Schema.Expected.Any(x=>x.Title=="Поручения"), "unused duplicate excluded");
var parsed = Atom.Parse(Entry(("Title","Платформа СОП и TWI"),("Id","1"),("ID","1")).ToString());
Check(Atom.Value(Atom.Properties(parsed).Single(),"Title")=="Платформа СОП и TWI", "Atom Cyrillic and Id/ID");
try { Atom.Parse("<!DOCTYPE x [<!ENTITY y SYSTEM 'file:///secret'>]><x>&y;</x>"); throw new Exception("DTD accepted"); }
catch (XmlException) { Console.WriteLine("PASS: DTD rejected"); }

var spec = Schema.Expected[0];
var actual = spec.Fields.Select((f,i)=>new FieldInfo(f.Title,"F"+i,"F"+i,f.Type,f.Required,false)).ToArray();
Check(Schema.Check(spec, actual).All(x=>x.Status=="OK"), "correct field schema");
Check(Schema.Check(spec, actual.Skip(1).ToArray())[0].Status=="Отсутствует", "missing field");
Check(Schema.Check(spec, actual.Append(actual[0]).ToArray())[0].Status=="Неоднозначное название", "duplicate title");
actual[0]=actual[0] with {Type="Number",ReadOnly=true};
Check(Schema.Check(spec,actual)[0].Status=="Тип, Только чтение", "type and readonly mismatch");

var ids = Schema.Expected.Select((s,i)=>(s, id:Guid.Parse($"00000000-0000-0000-0000-{i+1:D12}"))).ToArray();
var handler = new FixtureHandler(req =>
{
    if (req.Method != HttpMethod.Get) throw new Exception("Non-GET request");
    var path = req.RequestUri!.AbsolutePath;
    if (path.EndsWith("/_api/web")) return Entry(("Title","Платформа СОП и TWI")).ToString();
    if (path.EndsWith("/_api/web/lists"))
        return Feed(ids.Select(x=>Entry(("Title",x.s.Title),("Id",x.id.ToString()),("BaseTemplate",x.s.Template.ToString()),
            ("ItemCount","0"),("EnableVersioning","true"),("EnableMinorVersions","false"),
            ("EnableModeration","false"),("ForceCheckout","false"))));
    foreach (var x in ids)
        if (path.Contains(x.id.ToString(),StringComparison.OrdinalIgnoreCase))
            return Feed(x.s.Fields.Select((f,i)=>Field(f,i,x.s.Title=="Шаблоны аудитов L1" && f.Title=="Номер вопроса" ? "Text" : null)));
    throw new Exception("Unexpected endpoint");
});
using var client = new SharePointClient("https://sharepoint.example.test/site",handler);
Check(client.InScope(new Uri("https://sharepoint.example.test/site/_api/web")), "same API origin");
Check(!client.InScope(new Uri("https://other.example.test/site/_api/web")), "reject cross origin");
Check(!client.InScope(new Uri("https://sharepoint.example.test/other/_api/web")), "reject different site");
Check(!client.InScope(new Uri("http://sharepoint.example.test/site/_api/web")), "reject insecure scheme");
var report = await client.ReadSchemaAsync();
Check(report.Storages.Count==7 && report.Storages.Sum(x=>x.Fields.Count)==70, "complete read-only inventory");
Check(report.Storages.Count(x=>x.Status=="OK")==6, "schema mismatch visible");
Check(report.Storages.Single(x=>x.Title=="Шаблоны аудитов L1").Fields.Single(x=>x.Expected.Title=="Номер вопроса").Status=="Тип", "question number mismatch");
Check(handler.Requests==9, "only 9 metadata GETs for fixture");

using var paged = new SharePointClient("https://sharepoint.example.test/site",new FixtureHandler(req =>
{
    if (req.RequestUri!.AbsolutePath.EndsWith("/_api/web"))
        return Entry(("Title","Платформа СОП и TWI")).ToString();
    return new XElement(Atom.A+"feed",new XElement(Atom.A+"link",
        new XAttribute("rel","next"),new XAttribute("href","https://external.example.test/_api/web"))).ToString();
}));
try { await paged.ReadSchemaAsync(); throw new Exception("External next accepted"); }
catch (InvalidOperationException) { Console.WriteLine("PASS: cross-site pagination blocked"); }
Console.WriteLine("Fixture tests complete; no corporate network contacted.");

sealed class FixtureHandler(Func<HttpRequestMessage,string> response) : HttpMessageHandler
{
    public int Requests { get; private set; }
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken ct)
    {
        Requests++;
        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        { Content = new StringContent(response(request),System.Text.Encoding.UTF8,"application/atom+xml") });
    }
}
