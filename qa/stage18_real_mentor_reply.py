#!/usr/bin/env python3
"""Stage 18: actual Chrome file:// UI QA with mocked mentor response, no network."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import argparse

ROOT=Path(__file__).resolve().parents[1]
RELEASE=ROOT/"releases/stage18-mentor-reply-cleanup.html"

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--screenshot",default="")
    args=parser.parse_args()
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,channel="chrome",args=["--no-sandbox","--disable-dev-shm-usage"])
        ctx=browser.new_context(viewport={"width":1440,"height":990})
        page=ctx.new_page()
        page_errors=[]
        page.on("pageerror",lambda err:page_errors.append(str(err)))
        page.route("https://**",lambda route:route.abort())
        page.route("http://**",lambda route:route.abort())
        try:
            page.goto(RELEASE.resolve().as_uri(),wait_until="domcontentloaded",timeout=30000)
            page.evaluate("""() => {
              const step=createEmptyStep();
              step.action='Показать безопасное положение инструмента';
              state.meta.operation='Учебная операция';
              state.steps=[step];
              reviewIssues=[{
                severity:'improvement',type:'incomplete',stepId:1,field:'photo',
                description:'Шаг без фото',why:'Может быть непонятно исполнителю',
                suggestion:'Добавьте фото или используйте подсказку',
                fixValue:null,status:'open',thread:[],disputeOpen:true
              }];
              reviewSummary={summary:'',overall_quality:'good'};
              renderReviewResults(reviewSummary);
              window.__mentorResponse='1. Замечание связано с отсутствием фото. 2. Имеющаяся информация не объясняет, какой кадр нужен. 3. Лучше уточнить ключевой момент. 4. Вердикт: keep 5. Новый текст исправления: null';
              aiAsk=async()=>window.__mentorResponse;
            }""")
            page.evaluate("""() => {
                document.querySelector('textarea[data-dispute-input="0"]').value='какое фото лучше?';
                document.querySelector('button[data-dispute-send="0"]').click();
            }""")
            page.wait_for_function("""() => reviewIssues[0]?.thread?.some(m=>m.role==='mentor') && !reviewIssues[0].pending""",timeout=15000)
            issue=page.locator("#sopReviewIssues").inner_text()
            assert "Замечание связано с отсутствием фото" in issue,issue
            assert "Вердикт: keep" not in issue,issue
            assert "Новый текст исправления: null" not in issue,issue
            assert page.evaluate("() => reviewIssues[0].status")=="open"
            assert page.evaluate("() => reviewIssues[0].thread[1].text").endswith("Лучше уточнить ключевой момент.")
            # Proper structured JSON may still resolve the issue.
            page.evaluate("""() => {
              reviewIssues[0].thread=[];
              reviewIssues[0].status='open';
              reviewIssues[0].disputeOpen=true;
              renderReviewResults(reviewSummary);
              window.__mentorResponse=JSON.stringify({
                reply:'Аргумент принят. 4. Вердикт: keep 5. Новый текст исправления: null',
                verdict:'withdraw',new_fix:null
              });
              document.querySelector('textarea[data-dispute-input="0"]').value='Пояснение по технологии';
              document.querySelector('button[data-dispute-send="0"]').click();
            }""")
            page.wait_for_function("""() => reviewIssues[0]?.status==='withdrawn' && !reviewIssues[0].pending""",timeout=15000)
            issue2=page.locator("#sopReviewIssues").inner_text()
            assert "Аргумент принят." in issue2
            assert "Вердикт: keep" not in issue2
            assert "Новый текст исправления: null" not in issue2
            # An unsuccessful HTTP/API call must be labeled as a SYSTEM error.
            page.evaluate("""() => {
              reviewIssues[0].thread=[];
              reviewIssues[0].status='open';
              reviewIssues[0].disputeOpen=true;
              renderReviewResults(reviewSummary);
              aiAsk=async()=>{throw new Error('429 Too Many Requests')};
              document.querySelector('textarea[data-dispute-input="0"]').value='Повторяю запрос';
              document.querySelector('button[data-dispute-send="0"]').click();
            }""")
            page.wait_for_function("""() => reviewIssues[0]?.thread?.some(m=>m.role==='system') && !reviewIssues[0].pending""",timeout=15000)
            issue3=page.locator("#sopReviewIssues").inner_text()
            assert "Система" in issue3 and "Наставник: Ошибка ИИ" not in issue3,issue3
            assert page.evaluate("() => reviewIssues[0].status")=="open"
            if args.screenshot:
                shot=Path(args.screenshot);shot.parent.mkdir(parents=True,exist_ok=True)
                page.screenshot(path=str(shot),full_page=True)
            assert not page_errors,page_errors
            print("PASS: Chrome file:// mentor prose cleaned, JSON verdict works, system errors correctly labeled")
        except Exception:
            if args.screenshot:
                shot=Path(args.screenshot);shot.parent.mkdir(parents=True,exist_ok=True)
                page.screenshot(path=str(shot),full_page=True)
            raise
        finally:
            browser.close()

if __name__=="__main__":
    main()
