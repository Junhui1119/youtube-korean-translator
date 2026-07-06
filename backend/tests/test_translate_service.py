import httpx
import pytest
import respx

import translate_service


@respx.mock
async def test_translate_deepl_success():
    respx.post("https://api-free.deepl.com/v2/translate").mock(
        return_value=httpx.Response(200, json={"translations": [{"text": "你好"}]})
    )
    result = await translate_service.translate_deepl("안녕하세요", "fake-key")
    assert result == "你好"


@respx.mock
async def test_translate_deepl_http_error():
    respx.post("https://api-free.deepl.com/v2/translate").mock(
        return_value=httpx.Response(429)
    )
    with pytest.raises(RuntimeError, match="DeepL HTTP 429"):
        await translate_service.translate_deepl("안녕", "fake-key")


@respx.mock
async def test_translate_deepl_missing_text():
    respx.post("https://api-free.deepl.com/v2/translate").mock(
        return_value=httpx.Response(200, json={"translations": [{"text": ""}]})
    )
    with pytest.raises(RuntimeError, match="missing text"):
        await translate_service.translate_deepl("안녕", "fake-key")
