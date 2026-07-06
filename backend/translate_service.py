import httpx


async def translate_deepl(text: str, api_key: str) -> str:
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.post(
            "https://api-free.deepl.com/v2/translate",
            headers={"Authorization": f"DeepL-Auth-Key {api_key}"},
            json={"text": [text], "source_lang": "KO", "target_lang": "ZH-HANS"},
        )
    if not response.is_success:
        raise RuntimeError(f"DeepL HTTP {response.status_code}")
    data = response.json()
    translated = data.get("translations", [{}])[0].get("text", "")
    if not translated:
        raise RuntimeError("DeepL response missing text")
    return translated
