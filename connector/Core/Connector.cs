using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Xml;
using System.Xml.Linq;

namespace Sop.SharePoint;

public sealed record FieldSpec(string Title, string Type, bool Required = false);
public sealed record StorageSpec(string Title, int Template, FieldSpec[] Fields);
public sealed record FieldInfo(string Title, string InternalName, string EntityPropertyName,
    string Type, bool Required, bool ReadOnly);
public sealed record FieldCheck(FieldSpec Expected, FieldInfo? Actual, string Status);
public sealed record StorageReport(string Title, int ExpectedTemplate, int? ActualTemplate,
    int? ItemCount, bool? Versioning, bool? MinorVersions, bool? Moderation, bool? Checkout,
    IReadOnlyList<FieldCheck> Fields, string Status);
public sealed record SiteReport(string Title, IReadOnlyList<StorageReport> Storages);

public static class Schema
{
    private static FieldSpec F(string title, string type = "Text", bool required = false) => new(title, type, required);
    public static IReadOnlyList<StorageSpec> Expected { get; } = new StorageSpec[]
    {
        new("Библиотека СОП", 101, new[] { F("Номер СОП"), F("Редакция СОП"), F("Операция"),
            F("Подразделение"), F("Оборудование"), F("Статус СОП","Choice"), F("Ответственный","User") }),
        new("Библиотека TWI", 101, new[] { F("Номер TWI"), F("Номер исходного СОП"), F("Версия исходного СОП"),
            F("Операция"), F("Подразделение"), F("Статус TWI","Choice"), F("Ответственный","User") }),
        new("Шаблоны аудитов L1", 100, new[] { F("Код шаблона"), F("Редакция шаблона"), F("Номер вопроса","Number"),
            F("Раздел проверки"), F("Критерий соответствия","Note"), F("Подразделение"), F("Номер СОП"),
            F("Редакция СОП"), F("Шаг СОП"), F("Статус шаблона","Choice") }),
        new("Аудиты L1", 100, new[] { F("Плановая дата","DateTime"), F("Дата проведения","DateTime"), F("Код шаблона"),
            F("Редакция шаблона"), F("Подразделение"), F("Место проверки"), F("Номер СОП"), F("Редакция СОП"),
            F("Аудитор","User"), F("Статус аудита","Choice"), F("Итог аудита","Choice"), F("Комментарий","Note") }),
        new("Ответы аудитов L1", 100, new[] { F("Аудит","Lookup",true), F("Вопрос шаблона","Lookup"),
            F("Номер вопроса","Number"), F("Раздел проверки"), F("Критерий соответствия","Note"), F("Номер СОП"),
            F("Редакция СОП"), F("Шаг СОП"), F("Результат проверки","Choice"), F("Комментарий","Note") }),
        new("Замечания и действия", 100, new[] { F("Аудит","Lookup",true), F("Ответ аудита","Lookup"),
            F("Описание отклонения","Note"), F("Корректирующее действие","Note"), F("Результат проверки","Note"),
            F("Ответственный","User"), F("Проверил","User"), F("Срок устранения","DateTime"),
            F("Дата устранения","DateTime"), F("Дата закрытия","DateTime"), F("Статус замечания","Choice") }),
        new("Задачи", 100, new[] { F("Тип поручения","Choice"), F("Номер документа"), F("Редакция документа"),
            F("Ссылка на документ","URL"), F("Аудит","Lookup"), F("Замечание","Lookup"), F("Дата выполнения","DateTime"),
            F("Описание поручения","Note"), F("Ответственный","User"), F("Дата начала","DateTime"),
            F("Срок выполнения","DateTime"), F("Статус поручения","Choice"), F("Приоритет","Choice") })
    };

    public static IReadOnlyList<FieldCheck> Check(StorageSpec spec, IReadOnlyList<FieldInfo> fields)
        => spec.Fields.Select(expected =>
        {
            var matches = fields.Where(x => x.Title == expected.Title).ToArray();
            if (matches.Length != 1)
                return new FieldCheck(expected, null, matches.Length == 0 ? "Отсутствует" : "Неоднозначное название");
            var f = matches[0];
            var errors = new List<string>();
            if (f.Type != expected.Type) errors.Add("Тип");
            if (f.Required != expected.Required) errors.Add("Обязательность");
            if (f.ReadOnly) errors.Add("Только чтение");
            if (string.IsNullOrWhiteSpace(f.InternalName) || string.IsNullOrWhiteSpace(f.EntityPropertyName))
                errors.Add("Имя API");
            return new FieldCheck(expected, f, errors.Count == 0 ? "OK" : string.Join(", ", errors));
        }).ToArray();
}

public static class Atom
{
    public static readonly XNamespace A = "http://www.w3.org/2005/Atom";
    public static readonly XNamespace M = "http://schemas.microsoft.com/ado/2007/08/dataservices/metadata";
    public static readonly XNamespace D = "http://schemas.microsoft.com/ado/2007/08/dataservices";

    public static XDocument Parse(string text)
    {
        using var input = new StringReader(text);
        using var reader = XmlReader.Create(input, new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null,
            MaxCharactersInDocument = 16 * 1024 * 1024
        });
        var doc = XDocument.Load(reader);
        if (doc.Root?.Name != A + "entry" && doc.Root?.Name != A + "feed")
            throw new FormatException("Ожидался ответ SharePoint Atom XML.");
        return doc;
    }

    public static IEnumerable<XElement> Properties(XDocument doc)
    {
        var root = doc.Root ?? throw new FormatException("Нет корня XML.");
        var entries = root.Name == A + "entry" ? new[] { root } : root.Elements(A + "entry");
        foreach (var entry in entries)
            yield return entry.Element(A + "content")?.Element(M + "properties")
                ?? throw new FormatException("Нет свойств объекта SharePoint.");
    }

    public static string Value(XElement properties, string name)
        => properties.Element(D + name)?.Value ?? throw new FormatException("Нет поля API: " + name);
    public static bool Bool(XElement p, string name) => bool.Parse(Value(p, name));
    public static int Int(XElement p, string name) => int.Parse(Value(p, name), CultureInfo.InvariantCulture);
}

public sealed class SharePointClient : IDisposable
{
    private readonly Uri site;
    private readonly Uri api;
    private readonly HttpClient http;

    public SharePointClient(string siteAddress, HttpMessageHandler? testHandler = null)
    {
        if (!Uri.TryCreate(siteAddress.Trim(), UriKind.Absolute, out var u) ||
            u.Scheme != Uri.UriSchemeHttps || u.UserInfo.Length != 0 || u.Query.Length != 0 ||
            u.Fragment.Length != 0 || u.AbsolutePath.Contains("/_api", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Укажите HTTPS-адрес сайта SharePoint, без страницы, параметров и учетных данных.");
        site = new Uri(u.AbsoluteUri.TrimEnd('/') + "/");
        api = new Uri(site, "_api/");
        http = new HttpClient(testHandler ?? new HttpClientHandler
        {
            UseDefaultCredentials = true,
            AllowAutoRedirect = false,
            UseCookies = false
        }) { Timeout = TimeSpan.FromSeconds(30), MaxResponseContentBufferSize = 16 * 1024 * 1024 };
        http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/atom+xml"));
    }

    public bool InScope(Uri uri) => uri.IsAbsoluteUri && uri.Scheme == api.Scheme
        && uri.IdnHost.Equals(api.IdnHost, StringComparison.OrdinalIgnoreCase) && uri.Port == api.Port
        && uri.UserInfo.Length == 0 && uri.Fragment.Length == 0
        && uri.AbsolutePath.StartsWith(api.AbsolutePath, StringComparison.OrdinalIgnoreCase);

    private async Task<XDocument> GetAsync(Uri uri, CancellationToken ct)
    {
        if (!InScope(uri)) throw new InvalidOperationException("Запрос за пределами выбранного сайта остановлен.");
        using var response = await http.GetAsync(uri, ct).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException("SharePoint: HTTP " + (int)response.StatusCode, null, response.StatusCode);
        return Atom.Parse(await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false));
    }

    private async Task<List<XElement>> ReadCollection(string relative, CancellationToken ct)
    {
        var result = new List<XElement>();
        var current = new Uri(api, relative);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (var page = 0; page < 100; page++)
        {
            if (!seen.Add(current.AbsoluteUri)) throw new FormatException("Повтор ссылки на страницу API.");
            var doc = await GetAsync(current, ct).ConfigureAwait(false);
            result.AddRange(Atom.Properties(doc));
            var next = doc.Root?.Elements(Atom.A + "link")
                .SingleOrDefault(x => (string?)x.Attribute("rel") == "next");
            if (next is null) return result;
            var href = (string?)next.Attribute("href");
            if (string.IsNullOrWhiteSpace(href)) throw new FormatException("Пустая ссылка на страницу API.");
            current = new Uri(current, href);
        }
        throw new InvalidOperationException("Превышен предел страниц API.");
    }

    public async Task<SiteReport> ReadSchemaAsync(IProgress<string>? progress = null, CancellationToken ct = default)
    {
        var web = (await ReadCollection("web?$select=Title", ct).ConfigureAwait(false)).Single();
        var title = Atom.Value(web, "Title");
        if (title != "Платформа СОП и TWI")
            throw new InvalidOperationException("Название сайта не соответствует ожидаемой платформе. Проверьте адрес.");
        var lists = await ReadCollection("web/lists?$select=Title,Id,BaseTemplate,ItemCount,EnableVersioning,EnableMinorVersions,EnableModeration,ForceCheckout&$filter=Hidden%20eq%20false", ct).ConfigureAwait(false);
        var reports = new List<StorageReport>();
        foreach (var spec in Schema.Expected)
        {
            ct.ThrowIfCancellationRequested();
            progress?.Report("Чтение: " + spec.Title);
            var matches = lists.Where(x => Atom.Value(x, "Title") == spec.Title).ToArray();
            if (matches.Length != 1)
            {
                reports.Add(new(spec.Title, spec.Template, null, null, null, null, null, null,
                    Schema.Check(spec, Array.Empty<FieldInfo>()), matches.Length == 0 ? "Отсутствует" : "Неоднозначно"));
                continue;
            }
            var p = matches[0];
            var guid = Guid.Parse(Atom.Value(p, "Id"));
            var template = Atom.Int(p, "BaseTemplate");
            var properties = await ReadCollection(
                $"web/lists(guid'{guid:D}')/fields?$select=Title,InternalName,EntityPropertyName,TypeAsString,Required,ReadOnlyField&$filter=Hidden%20eq%20false", ct).ConfigureAwait(false);
            var fields = properties.Select(f => new FieldInfo(Atom.Value(f, "Title"), Atom.Value(f, "InternalName"),
                Atom.Value(f, "EntityPropertyName"), Atom.Value(f, "TypeAsString"), Atom.Bool(f, "Required"),
                Atom.Bool(f, "ReadOnlyField"))).ToArray();
            var checks = Schema.Check(spec, fields);
            var versioning = Atom.Bool(p, "EnableVersioning");
            var minor = Atom.Bool(p, "EnableMinorVersions");
            var moderation = Atom.Bool(p, "EnableModeration");
            var checkout = Atom.Bool(p, "ForceCheckout");
            var settingsOk = spec.Template != 101 || (versioning && !minor && !moderation && !checkout);
            reports.Add(new(spec.Title, spec.Template, template, Atom.Int(p, "ItemCount"), versioning, minor,
                moderation, checkout, checks, template == spec.Template && settingsOk && checks.All(x => x.Status == "OK")
                ? "OK" : "Требуется проверка"));
        }
        return new(title, reports);
    }

    public void Dispose() => http.Dispose();
}
