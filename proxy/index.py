"""Safe opt-in upgrade of the original SOP Constructor Yandex Cloud proxy.

Cloud Functions entrypoint: index.handler.
With no SOP_* flags, preserves the old model URI, 2000 output token limit,
old request to Yandex AI Studio and choices[0].message.content response.
Uses Python standard library only. See docs/PROXY_SAFE_UPGRADE_RU.md.
"""

import base64
import json
import math
import os
import urllib.error
import urllib.request

UPSTREAM_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
LEGACY_MODEL = "yandexgpt-lite/latest"
LEGACY_MAX_TOKENS = "2000"
MAX_BODY_BYTES = 1_000_000
MAX_RESPONSE_BYTES = 2_000_000
MAX_MESSAGES = 64

MODEL_ALIASES = {
    "yandexgpt-lite": LEGACY_MODEL,
    "yandexgpt": "yandexgpt-5-pro",
    "yandexgpt-5": "yandexgpt-5.1",
    "yandexgpt-5.1": "yandexgpt-5.1",
}


def enabled(name):
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def respond(code, payload, cors):
    return {
        "statusCode": code,
        "headers": dict(cors, **{"Content-Type": "application/json; charset=utf-8"}),
        "body": json.dumps(payload, ensure_ascii=False),
    }


def fail(code, message, cors):
    return respond(code, {"error": message}, cors)


def parse_body(event):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        try:
            raw = base64.b64decode(raw, validate=True).decode("utf-8")
        except (ValueError, UnicodeDecodeError) as e:
            raise ValueError("Неверная кодировка base64-тела запроса") from e
    if not isinstance(raw, str) or len(raw.encode("utf-8")) > MAX_BODY_BYTES:
        raise ValueError("Тело запроса превышает допустимый размер")
    try:
        body = json.loads(raw)
    except (ValueError, TypeError) as e:
        raise ValueError("Тело запроса должно содержать корректный JSON") from e
    if not isinstance(body, dict):
        raise ValueError("Тело запроса должно быть JSON-объектом")
    return body


def parse_messages(body):
    source = body.get("messages") or []
    if not isinstance(source, list) or len(source) > MAX_MESSAGES:
        raise ValueError("messages должен быть массивом допустимой длины")
    messages = []
    for item in source:
        if not isinstance(item, dict):
            raise ValueError("Некорректный элемент messages")
        role = item.get("role") or "user"
        if role not in ("system", "user", "assistant"):
            role = "user"
        content = item.get("text") or item.get("content") or ""
        if not isinstance(content, str):
            raise ValueError("Сообщения должны содержать текст, а не изображения")
        if content:
            messages.append({"role": role, "text": content})
    if not messages:
        raise ValueError("Пустой список messages")
    return messages


def choose_model(body):
    if not enabled("SOP_ENABLE_MODEL_ROUTING"):
        return LEGACY_MODEL
    key = body.get("model") or "yandexgpt-lite"
    if not isinstance(key, str) or key not in MODEL_ALIASES:
        raise ValueError("Неизвестная модель ИИ: разрешены только имена из списка")
    return MODEL_ALIASES[key]


def choose_tokens(body):
    if not enabled("SOP_ENABLE_CLIENT_MAX_TOKENS"):
        return LEGACY_MAX_TOKENS
    raw = body.get("max_tokens", 2000)
    if isinstance(raw, bool):
        raise ValueError("max_tokens должно быть целым числом")
    try:
        n = int(raw)
    except (ValueError, TypeError, OverflowError) as e:
        raise ValueError("max_tokens должно быть целым числом") from e
    if str(raw).strip() != str(n):
        raise ValueError("max_tokens должно быть целым числом")
    try:
        cap = int(os.environ.get("SOP_MAX_OUTPUT_TOKENS", "4000"))
    except ValueError as e:
        raise ValueError("Ошибка настройки SOP_MAX_OUTPUT_TOKENS") from e
    if not 1 <= cap <= 16000:
        raise ValueError("SOP_MAX_OUTPUT_TOKENS вне допустимого диапазона")
    if not 1 <= n <= cap:
        raise ValueError("max_tokens должно быть от 1 до %s" % cap)
    return str(n)


def choose_temperature(body):
    try:
        temp = float(body.get("temperature", 0.3))
    except (ValueError, TypeError) as e:
        raise ValueError("Некорректное значение temperature") from e
    if not math.isfinite(temp) or not 0 <= temp <= 1:
        raise ValueError("temperature должно быть от 0 до 1")
    return temp


def safe_detail(detail, api_key, folder_id):
    return str(detail).replace(api_key, "[SECRET]").replace(folder_id, "[FOLDER]")[:800]


def handler(event, context):
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Max-Age": "86400",
    }
    if (event.get("httpMethod") or "POST").upper() == "OPTIONS":
        return {"statusCode": 204, "headers": cors, "body": ""}
    if (event.get("httpMethod") or "POST").upper() != "POST":
        return fail(405, "Метод не поддерживается", cors)

    api_key = (os.environ.get("YC_API_KEY") or "").strip()
    folder_id = (os.environ.get("YC_FOLDER_ID") or "").strip()
    if not api_key:
        return fail(500, "Не задана переменная YC_API_KEY в окружении функции", cors)
    if not folder_id:
        return fail(500, "Не задана переменная YC_FOLDER_ID в окружении функции", cors)
    if not folder_id.startswith("b1g"):
        return fail(500, "YC_FOLDER_ID не похож на идентификатор каталога", cors)
    if not api_key.startswith("AQVN"):
        return fail(500, "YC_API_KEY не похож на API-ключ", cors)

    try:
        body = parse_body(event)
        messages = parse_messages(body)
        suffix = choose_model(body)
        tokens = choose_tokens(body)
        temperature = choose_temperature(body)
    except ValueError as e:
        return fail(400, str(e), cors)

    upstream_body = {
        "modelUri": "gpt://%s/%s" % (folder_id, suffix),
        "completionOptions": {
            "stream": False,
            "temperature": temperature,
            "maxTokens": tokens,
        },
        "messages": messages,
    }
    req = urllib.request.Request(
        UPSTREAM_URL,
        data=json.dumps(upstream_body, ensure_ascii=False).encode("utf-8"),
        method="POST",
    )
    req.add_header("Authorization", "Api-Key %s" % api_key)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            received = response.read(MAX_RESPONSE_BYTES + 1)
        if len(received) > MAX_RESPONSE_BYTES:
            return fail(502, "Ответ ИИ превышает допустимый размер", cors)
        data = json.loads(received.decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            details = e.read(8192).decode("utf-8", "replace")
        except Exception:
            details = ""
        return fail(e.code, "YandexGPT HTTP %s %s. Подробности: %s" % (
            e.code, e.reason, safe_detail(details, api_key, folder_id)), cors)
    except (urllib.error.URLError, TimeoutError) as e:
        return fail(503, "Ошибка соединения с сервисом ИИ: %s" % type(e).__name__, cors)
    except (ValueError, UnicodeError):
        return fail(502, "Сервис ИИ вернул некорректный JSON", cors)
    except Exception:
        return fail(502, "Неожиданная ошибка при обращении к сервису ИИ", cors)

    try:
        alternative = data["result"]["alternatives"][0]
        text = alternative["message"]["text"]
        status = alternative.get("status") or ""
        if not isinstance(text, str) or not text.strip():
            raise ValueError("Empty completion")
    except (KeyError, IndexError, TypeError, ValueError):
        return fail(502, "Неожиданный формат ответа YandexGPT", cors)

    if enabled("SOP_STRICT_COMPLETION"):
        if status == "ALTERNATIVE_STATUS_TRUNCATED_FINAL":
            return fail(502, "ИИ достиг лимита токенов; неполный ответ не применён", cors)
        if status == "ALTERNATIVE_STATUS_CONTENT_FILTER":
            return fail(422, "ИИ остановил генерацию из-за фильтра содержимого", cors)

    result = {"choices": [{"message": {"content": text}}]}
    if enabled("SOP_INCLUDE_USAGE"):
        result["model"] = suffix
        result["usage"] = data.get("result", {}).get("usage", {})
        result["finish_status"] = status
    return respond(200, result, cors)
