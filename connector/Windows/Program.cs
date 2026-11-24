using Sop.SharePoint;
using System.Drawing;

namespace Sop.SharePoint.Windows;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new ConnectorForm());
    }
}

internal sealed class ConnectorForm : Form
{
    private readonly TextBox address = new() { Dock = DockStyle.Fill, PlaceholderText = "https://.../sop-platform" };
    private readonly Button connect = new() { Text = "Проверить подключение", AutoSize = true };
    private readonly Button cancel = new() { Text = "Отменить", AutoSize = true, Enabled = false };
    private readonly Label status = new() { Dock = DockStyle.Fill, AutoEllipsis = true, Text = "Только чтение · введите разрешённый адрес сайта." };
    private readonly DataGridView storages = CreateGrid();
    private readonly DataGridView fields = CreateGrid();
    private CancellationTokenSource? pending;

    public ConnectorForm()
    {
        Text = "SOP SharePoint Connector — 1.0.0 pilot";
        Font = new Font("Segoe UI", 10);
        MinimumSize = new Size(920, 560);
        Size = new Size(1250, 760);
        StartPosition = FormStartPosition.CenterScreen;
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3, Padding = new Padding(16) };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var top = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 4 };
        top.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        top.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        top.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        top.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        top.Controls.Add(new Label { Text = "Адрес сайта:", AutoSize = true, Anchor = AnchorStyles.Left }, 0, 0);
        top.Controls.Add(address, 1, 0);
        top.Controls.Add(connect, 2, 0);
        top.Controls.Add(cancel, 3, 0);
        var tabs = new TabControl { Dock = DockStyle.Fill };
        var storageTab = new TabPage("Хранилища");
        var fieldTab = new TabPage("Проверка полей");
        storageTab.Controls.Add(storages);
        fieldTab.Controls.Add(fields);
        tabs.TabPages.Add(storageTab);
        tabs.TabPages.Add(fieldTab);
        root.Controls.Add(top, 0, 0);
        root.Controls.Add(status, 0, 1);
        root.Controls.Add(tabs, 0, 2);
        Controls.Add(root);
        AddColumns(storages, "Раздел", "Тип факт / ожидается", "Записей", "Версии", "Младшие версии", "Согласование", "Извлечение", "Схема");
        AddColumns(fields, "Раздел", "Поле", "Тип ожидается", "Тип фактически", "Обязательное", "InternalName", "EntityPropertyName", "Результат");
        connect.Click += async (_, _) => await ConnectAsync();
        cancel.Click += (_, _) => pending?.Cancel();
        FormClosing += (_, _) => pending?.Cancel();
    }

    private static DataGridView CreateGrid() => new()
    {
        Dock = DockStyle.Fill, ReadOnly = true, AllowUserToAddRows = false, AllowUserToDeleteRows = false,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.DisplayedCells,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect, RowHeadersVisible = false,
        BackgroundColor = Color.White, BorderStyle = BorderStyle.None
    };

    private static void AddColumns(DataGridView grid, params string[] titles)
    {
        for (var i = 0; i < titles.Length; i++) grid.Columns.Add("c" + i, titles[i]);
    }

    private static string Flag(bool? value) => value is null ? "—" : value.Value ? "Да" : "Нет";
    private async Task ConnectAsync()
    {
        if (pending is not null) return;
        if (MessageBox.Show(this, "Подключиться к указанному корпоративному сайту с текущей учетной записью Windows?\n" +
            "Только разрешённое чтение структуры. Пароли не сохраняются.", "Подключение",
            MessageBoxButtons.OKCancel, MessageBoxIcon.Question) != DialogResult.OK) return;
        var cts = new CancellationTokenSource();
        pending = cts;
        connect.Enabled = false;
        cancel.Enabled = true;
        address.Enabled = false;
        storages.Rows.Clear();
        fields.Rows.Clear();
        status.Text = "Подключение...";
        try
        {
            using var client = new SharePointClient(address.Text);
            var progress = new Progress<string>(s => { if (!IsDisposed) status.Text = s; });
            var report = await client.ReadSchemaAsync(progress, cts.Token);
            if (IsDisposed) return;
            foreach (var row in report.Storages)
            {
                storages.Rows.Add(row.Title, $"{row.ActualTemplate?.ToString() ?? "—"} / {row.ExpectedTemplate}",
                    row.ItemCount?.ToString() ?? "—", Flag(row.Versioning), Flag(row.MinorVersions),
                    Flag(row.Moderation), Flag(row.Checkout), row.Status);
                foreach (var field in row.Fields)
                    fields.Rows.Add(row.Title, field.Expected.Title, field.Expected.Type, field.Actual?.Type ?? "—",
                        Flag(field.Actual?.Required), field.Actual?.InternalName ?? "—",
                        field.Actual?.EntityPropertyName ?? "—", field.Status);
            }
            var ok = report.Storages.Count(x => x.Status == "OK");
            var goodFields = report.Storages.Sum(x => x.Fields.Count(f => f.Status == "OK"));
            var totalFields = report.Storages.Sum(x => x.Fields.Count);
            status.Text = $"{report.Title} · Хранилища {ok}/{report.Storages.Count} · Поля {goodFields}/{totalFields}. Только чтение.";
        }
        catch (OperationCanceledException) { if (!IsDisposed) status.Text = "Запрос отменён или истекло время ожидания."; }
        catch (HttpRequestException ex) { if (!IsDisposed) status.Text = ex.StatusCode is { } code ? $"HTTP {(int)code}. Проверьте разрешения и подключение." : "Ошибка сети или TLS. Настройки безопасности не изменяйте."; }
        catch (Exception ex) { if (!IsDisposed) status.Text = ex is ArgumentException or FormatException or InvalidOperationException ? ex.Message : "Не удалось прочитать схему. Проверьте подключение."; }
        finally
        {
            pending = null;
            cts.Dispose();
            if (!IsDisposed) { connect.Enabled = true; cancel.Enabled = false; address.Enabled = true; }
        }
    }
}
