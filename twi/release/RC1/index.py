import os
import json
import urllib.request
import urllib.error

API_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
MAX_BODY_BYTES = 120_000
MAX_PROMPT_CHARS = 60_000
ALLOWED_MODELS = {"yandexgpt/latest", "yandexgpt-lite/latest"}

STRICT_FACT_RULES = (
    "Используй только факты, поля и числа, явно переданные пользователем в агрегированном JSON. "
    "Запрещено придумывать факты, причины, проценты, средние, разницы, тренды, рейтинги или количества. "
    "Запрещено самостоятельно пересчитывать показатели. Если данных недостаточно, прямо напиши: 'недостаточно данных'. "
    "Если пользователь передал TOP-3, не меняй его состав и порядок. "
    "Причинно-следственную связь нельзя утверждать без данных; допустимую интерпретацию формулируй только как гипотезу с явной пометкой 'гипотеза'. "
)

SYSTEM_PROMPTS = {
    "plant_summary": (
        "Ты методолог Training Within Industry Job Instruction и аналитик производственного обучения. "
        + STRICT_FACT_RULES +
        "Сравни текущий и предыдущий период только по переданным агрегатам, объясни устойчивые повторяющиеся паттерны, "
        "прокомментируй уже рассчитанный TOP-3 системных проблем и предложи конкретные действия. "
        "Ответ краткий, структурированный, на русском языке."
    ),
    "leadership_report": (
        "Ты готовишь управленческий вывод для руководства завода по системе TWI Job Instruction. "
        + STRICT_FACT_RULES +
        "Сформируй только управленчески значимые выводы из переданных агрегатов: динамика, системные риски, устойчивость, "
        "корректирующие мероприятия и их эффект. Не пересказывай все данные подряд. "
        "Ответ должен быть пригоден для вставки в официальный управленческий отчёт, на русском языке."
    ),
    "exception_analysis": (
        "Ты методолог Training Within Industry Job Instruction. "
        + STRICT_FACT_RULES +
        "Разбери нетипичный случай только по переданным данным и предложи не более 3 действий."
    ),
}


def cors_headers():
    # Для локального HTML, открытого через file://, Origin обычно равен null.
    return {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "null",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        "Cache-Control": "no-store",
        "Vary": "Origin",
    }


def response(status, payload):
    return {
        "statusCode": status,
        "headers": cors_headers(),
        "body": json.dumps(payload, ensure_ascii=False),
    }


def handler(event, context):
    method = (
        event.get("httpMethod")
        or event.get("requestContext", {}).get("httpMethod")
        or ""
    ).upper()

    if method == "OPTIONS":
        return response(204, {})

    if method != "POST":
        return response(405, {"ok": False, "error": "method_not_allowed"})

    raw_body = event.get("body") or ""
    if len(raw_body.encode("utf-8")) > MAX_BODY_BYTES:
        return response(413, {"ok": False, "error": "payload_too_large"})

    try:
        body = json.loads(raw_body)
    except (json.JSONDecodeError, TypeError):
        return response(400, {"ok": False, "error": "invalid_json"})

    action = body.get("action")
    if action == "health":
        return response(200, {"ok": True, "service": "twi-ai-proxy", "contract": "v2"})

    if action not in SYSTEM_PROMPTS:
        return response(400, {"ok": False, "error": "unsupported_action"})

    prompt = body.get("prompt", "")
    if not isinstance(prompt, str):
        return response(400, {"ok": False, "error": "invalid_prompt"})
    prompt = prompt.strip()
    if not prompt:
        return response(400, {"ok": False, "error": "empty_prompt"})
    if len(prompt) > MAX_PROMPT_CHARS:
        return response(413, {"ok": False, "error": "prompt_too_large"})

    requested_model = body.get("model") or os.environ.get("YANDEX_MODEL", "yandexgpt/latest")
    model_name = requested_model if requested_model in ALLOWED_MODELS else "yandexgpt/latest"

    api_key = os.environ.get("YANDEX_API_KEY", "").strip()
    folder_id = os.environ.get("YANDEX_FOLDER_ID", "").strip()
    if not api_key or not folder_id:
        return response(500, {"ok": False, "error": "server_not_configured"})

    payload = {
        "modelUri": f"gpt://{folder_id}/{model_name}",
        "completionOptions": {
            "stream": False,
            "temperature": 0.1,
            "maxTokens": 1400,
        },
        "messages": [
            {"role": "system", "text": SYSTEM_PROMPTS[action]},
            {"role": "user", "text": prompt},
        ],
    }

    req = urllib.request.Request(
        API_URL,
        method="POST",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Api-Key {api_key}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=45) as upstream:
            result = json.loads(upstream.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return response(502, {"ok": False, "error": "ai_upstream_error", "status": exc.code})
    except Exception:
        return response(502, {"ok": False, "error": "ai_unavailable"})

    try:
        text = result["result"]["alternatives"][0]["message"]["text"]
    except (KeyError, IndexError, TypeError):
        return response(502, {"ok": False, "error": "unexpected_ai_response"})

    return response(200, {"ok": True, "text": text, "model": model_name, "action": action})
