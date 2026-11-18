import os
import json
import hmac
import urllib.request
import urllib.error

API_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
MAX_BODY_BYTES = 100_000
MAX_PROMPT_CHARS = 40_000
ALLOWED_MODELS = {"yandexgpt/latest", "yandexgpt-lite/latest"}

SYSTEM_PROMPTS = {
    "plant_summary": (
        "Ты методолог Training Within Industry Job Instruction. "
        "Проанализируй только переданные агрегированные данные аудитов. "
        "Не выдумывай отсутствующие факты. Не запрашивай персональные данные. "
        "Выдели системные слабые критерии, повторяющиеся проблемы и предложи "
        "3-5 конкретных мероприятий. Ответ дай кратко, на русском языке."
    ),
    "exception_analysis": (
        "Ты методолог Training Within Industry Job Instruction. "
        "Разбери нетипичный случай аудита только по переданным данным. "
        "Дай краткую причину риска и не более 3 конкретных действий."
    ),
}


def cors_headers():
    # Для HTML, открытого напрямую через file://, браузер присылает Origin: null.
    return {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "null",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-TWI-Token",
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


def get_header(event, name):
    wanted = name.lower()
    for key, value in (event.get("headers") or {}).items():
        if key.lower() == wanted:
            return value
    return ""


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

    expected_token = os.environ.get("TWI_PROXY_TOKEN", "")
    supplied_token = get_header(event, "X-TWI-Token")
    if not expected_token or not supplied_token or not hmac.compare_digest(supplied_token, expected_token):
        return response(401, {"ok": False, "error": "unauthorized"})

    raw_body = event.get("body") or ""
    if len(raw_body.encode("utf-8")) > MAX_BODY_BYTES:
        return response(413, {"ok": False, "error": "payload_too_large"})

    try:
        body = json.loads(raw_body)
    except (json.JSONDecodeError, TypeError):
        return response(400, {"ok": False, "error": "invalid_json"})

    action = body.get("action")
    if action == "health":
        return response(200, {"ok": True, "service": "twi-ai-proxy"})

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

    api_key = os.environ["YANDEX_API_KEY"]
    folder_id = os.environ["YANDEX_FOLDER_ID"]

    payload = {
        "modelUri": f"gpt://{folder_id}/{model_name}",
        "completionOptions": {
            "stream": False,
            "temperature": 0.2,
            "maxTokens": 1200,
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

    return response(200, {"ok": True, "text": text, "model": model_name})
