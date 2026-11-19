"""Validate image count in the Excel export with openpyxl (safely)."""
from pathlib import Path
import zipfile

def check_xlsx(path: Path) -> None:
    from openpyxl import load_workbook
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        images=[name for name in archive.namelist() if name.startswith("xl/media/")]
        assert len(images)>=3,images
    wb=load_workbook(path,read_only=False)
    assert wb.sheetnames==["СОП","ФРВ","Чек-лист оценки СОП"],wb.sheetnames
    assert len(wb["СОП"]._images)>=3,len(wb["СОП"]._images)
